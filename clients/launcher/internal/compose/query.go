package compose

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

func (c *Compose) query(args ...string) ([]byte, error) {
	command := exec.Command(c.Runtime.Bin, append(c.baseArgs(), args...)...)
	command.Env = c.composeEnv()
	output, err := command.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s compose %s: %w: %s", c.Runtime.Name, strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return output, nil
}

// ServiceNames includes services behind profiles and stack-specific overlays.
func (c *Compose) ServiceNames() ([]string, error) {
	output, err := c.query(append(AllProfiles(), "config", "--services")...)
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, line := range strings.Split(string(output), "\n") {
		if name := strings.TrimSpace(line); name != "" {
			names = append(names, name)
		}
	}
	return names, nil
}

// PsJSON accepts Compose's newline-delimited objects as well as array output.
func (c *Compose) PsJSON() ([]json.RawMessage, error) {
	output, err := c.query("ps", "--format", "json")
	if err != nil {
		return nil, err
	}
	return parsePsRows(output)
}

func parsePsRows(output []byte) ([]json.RawMessage, error) {
	output = bytes.TrimSpace(output)
	rows := []json.RawMessage{}
	if len(output) == 0 {
		return rows, nil
	}
	if output[0] == '[' {
		if err := json.Unmarshal(output, &rows); err != nil {
			return nil, fmt.Errorf("parse Compose ps JSON array: %w", err)
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		for _, row := range rows {
			if len(row) == 0 || row[0] != '{' {
				return nil, fmt.Errorf("parse Compose ps JSON array: expected objects")
			}
		}
		return rows, nil
	}
	for _, line := range bytes.Split(output, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		if line[0] != '{' || !json.Valid(line) {
			return nil, fmt.Errorf("parse Compose ps JSON row: invalid object")
		}
		rows = append(rows, append(json.RawMessage(nil), line...))
	}
	return rows, nil
}
