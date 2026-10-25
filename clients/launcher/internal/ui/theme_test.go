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
