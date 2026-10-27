package ui

import (
	"bytes"
	"testing"
)

func TestHumanOutputPreservesNewlinesWithoutColorOrPadding(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	var b bytes.Buffer
	w := NeutralWriter{Writer: &b}
	for _, chunk := range []string{"first\nsecond\n", "third", "\n"} {
		n, err := w.Write([]byte(chunk))
		if err != nil || n != len(chunk) {
			t.Fatalf("write: %d %v", n, err)
		}
	}
	if b.String() != "first\nsecond\nthird\n" {
		t.Fatalf("unexpected human output: %q", b.String())
	}
}

// TestSelectedOptionCarriesOwnBackground guards the update/consent prompt
// legibility fix: the active (cursor) option must paint its own background so
// it stays readable even when Huh mis-detects the terminal canvas (e.g. a WSL
// terminal that doesn't answer the OSC 11 background query selects the light
// ramp on a dark screen). Without an explicit background the near-black
// light-ramp option text lands on the real dark canvas and disappears.
func TestSelectedOptionCarriesOwnBackground(t *testing.T) {
	for _, dark := range []bool{true, false} {
		th := DecepticonTheme(dark)
		if _, _, _, a := th.Focused.SelectedOption.GetBackground().RGBA(); a == 0 {
			t.Fatalf("dark=%v: SelectedOption has no background; active row can render invisibly when canvas detection flips", dark)
		}
	}
}
