package compose

import (
	"encoding/json"
	"testing"
)

func TestParsePsRows(t *testing.T) {
	cases := []struct {
		name, input string
		want        int
		failed      bool
	}{
		{"empty", "", 0, false},
		{"array", `[{"Name":"a"},{"Name":"b"}]`, 2, false},
		{"lines", "{\"Name\":\"a\"}\n{\"Name\":\"b\"}\n", 2, false},
		{"null", "null", 0, true},
		{"invalid", "{bad}", 0, true},
		{"scalar-array", `[1]`, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := parsePsRows([]byte(tc.input))
			if (err != nil) != tc.failed {
				t.Fatalf("error = %v", err)
			}
			if tc.failed {
				return
			}
			if len(rows) != tc.want {
				t.Fatalf("rows = %d, want %d", len(rows), tc.want)
			}
			encoded, err := json.Marshal(rows)
			if err != nil || len(encoded) == 0 || encoded[0] != '[' {
				t.Fatalf("JSON array = %s, %v", encoded, err)
			}
		})
	}
}
