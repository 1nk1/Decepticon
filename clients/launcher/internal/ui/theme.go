package ui

import (
	"fmt"
	"io"
	"os"
	"strings"

	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/colorprofile"
	"golang.org/x/term"
)

// Neutral graphite/silver ramp, mirrored by clients/cli/src/utils/theme.ts.
const (
	ColorGround  = "#101010"
	ColorSurface = "#1c1c1c"
	ColorRaised  = "#2a2a2a"
	ColorBorder  = "#666666"
	ColorMuted   = "#a0a0a0"
	ColorText    = "#d4d4d4"
	ColorFocus   = "#eeeeee"
)

// DisableMouse is bound to the launcher flag; the CLI receives its own setting.
var DisableMouse bool

var (
	// Keep exported style names for callers; status also has an icon and text.
	Red         = lipgloss.NewStyle().Foreground(lipgloss.Color("#f4f4f4")).Bold(true)
	Green       = lipgloss.NewStyle().Foreground(lipgloss.Color("#c4c4c4"))
	Yellow      = lipgloss.NewStyle().Foreground(lipgloss.Color("#dedede")).Bold(true)
	Cyan        = lipgloss.NewStyle().Foreground(lipgloss.Color("#b8b8b8"))
	Dim         = lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMuted))
	Text        = lipgloss.NewStyle().Foreground(lipgloss.Color(ColorText))
	Bold        = Text.Bold(true)
	BannerStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(ColorText))
	BannerBold  = lipgloss.NewStyle().Foreground(lipgloss.Color(ColorFocus)).Bold(true)
)

// Full banner: braille logo + block-character text art (≥140 cols)
const bannerFull = "" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣶⣤⡀⠀⣤⣤⣾⣿⣦⣠⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣶⣶⣿⢿⣿⣿⣿⣿⣿⣻⣿⣟⣿⣿⣷⣾⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⢰⣿⣄⣼⣿⣆⠀⣀⣴⣾⣿⣻⣟⣷⣯⢿⡾⣯⣷⣿⣾⣯⣷⢿⡾⣿⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⣀⣸⣿⣿⣽⣯⣿⣻⣿⣟⣿⢾⣽⣟⣿⣻⣟⣿⣻⣯⡿⣾⣽⣟⣿⣽⣟⡿⣿⢿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⢠⣾⣿⣷⣽⣷⢿⣷⢟⣮⣿⣻⡿⣿⣻⣿⣽⣻⢾⣯⣿⣻⣛⠿⣾⣽⢷⡿⣾⣻⣟⣯⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠉⠙⢹⣷⢿⣯⡿⣿⢿⣟⣷⣿⣿⣿⣟⣯⣿⣻⢷⣿⡧⣿⢟⢮⣻⣟⣿⣽⣯⢿⣽⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀██████████                                         █████     ███\n" +
	"⠀⠀⠀⠀⣼⣿⣻⣿⣾⣿⣟⣿⡾⣿⢾⣽⣟⣿⣿⡾⣯⣿⣾⣷⣽⣳⣧⣿⢿⣷⢿⡾⣿⣞⡿⣿⡀⠀⠀⠀⠀⠀⠀⠀░░███░░░░███                                       ░░███     ░░░\n" +
	"⠀⠀⠀⠀⠻⣟⢽⣿⣾⢯⣿⣾⣟⡿⣯⣿⣿⣽⢿⣟⣿⣽⣟⣾⣿⣯⢿⡾⣿⣽⣻⣟⣷⡿⣽⣿⣯⠀⠀⠀⠀⠀⠀⠀⠀░███   ░░███  ██████   ██████   ██████  ████████  ███████   ████   ██████   ██████  ████████\n" +
	"⠀⠀⠀⠀⠀⠀⠸⣿⣟⣿⣻⣾⣽⣿⣿⣻⣯⣿⣿⡿⣿⣾⣿⣿⣾⣻⣟⣿⣷⢿⣷⣯⣿⣽⢿⣾⠗⠀⠀⠀⠀⠀⠀⠀⠀░███    ░███ ███░░███ ███░░███ ███░░███░░███░░███░░░███░   ░░███  ███░░███ ███░░███░░███░░███\n" +
	"⠀⠀⠀⠀⠀⠀⢰⣿⣟⣿⢿⣿⡽⣷⣿⣿⡿⣿⡿⣿⣿⣿⣽⢷⣻⣽⣿⣿⣻⣿⣷⣿⣷⢿⠿⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀░███    ░███░███████ ░███ ░░░ ░███████  ░███ ░███  ░███     ░███ ░███ ░░░ ░███ ░███ ░███ ░███\n" +
	"⠀⠀⠀⠀⠀⠀⢸⣿⣯⣟⣿⣯⣿⣟⣿⣾⣿⣿⢿⣿⡿⣺⣷⣿⢿⡫⠷⠝⠽⠝⣟⢷⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀░███    ███ ░███░░░  ░███  ███░███░░░   ░███ ░███  ░███ ███ ░███ ░███  ███░███ ░███ ░███ ░███\n" +
	"⠀⠀⠀⠀⠀⠀⢘⣿⣾⢯⣿⣷⢿⡿⣿⣟⣿⣽⣿⣿⣝⣿⢿⠕⠁⠀⠀⢀⠄⠀⠀⠉⢻⢿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀ ██████████  ░░██████ ░░██████ ░░██████  ░███████   ░░█████  █████░░██████ ░░██████  ████ █████\n" +
	"⠀⠀⠀⠀⠀⠀⠀⣿⣿⢯⣿⣿⣻⣿⣿⣿⣻⣾⣿⣮⣿⡿⡇⠀⠀⠀⢃⣈⣤⠄⡨⠀⠈⢻⣿⡿⡄⠀⠀⠀⠀⠀⠀⠀⠀░░░░░░░░░░    ░░░░░░   ░░░░░░   ░░░░░░   ░███░░░     ░░░░░  ░░░░░  ░░░░░░   ░░░░░░  ░░░░ ░░░░░\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠸⣿⣟⣷⢿⣿⣿⣯⣿⣽⣿⣿⢮⣿⣯⠇⠀⢀⡉⢴⡽⣙⠀⠄⠀⠀⣸⣿⣟⡇⠀⠀⠀⠀⠀⠀⠀⠀                                         ░███\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠹⣿⣯⡿⣿⣾⣿⡿⣾⣷⣿⣯⢿⣿⣣⠀⠀⠀⠯⠋⡁⠐⠀⠀⢠⣟⣿⢯⠂⠀⠀⠀⠀⠀⠀⠀⠀                                         █████\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⡿⣿⣳⣿⣻⣿⣷⡿⣿⣿⣝⣿⣿⣷⣄⡀⠀⠀⠀⠈⣀⣴⣿⣿⣻⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀                                       ░░░░░\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣻⣷⣿⣽⢿⣿⣿⣟⣿⣮⣟⣽⣿⣿⣷⣾⣾⣿⡿⣿⢯⣿⣾⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⠿⡿⣿⣾⣽⣟⣿⢿⣿⣷⣷⣽⣽⣫⣟⣽⣽⡾⠓⠻⣿⣿⣿⣦⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⠋⠟⢟⢿⢿⡷⣿⢿⢿⡻⢟⠟⠋⠈⠀⠀⠀⠑⠿⣿⣿⣿⣶⡀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢷⡿⡯⠃⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"

// Braille logo only (extracted from full banner, no block text)
const bannerLogo = "" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣶⣤⡀⠀⣤⣤⣾⣿⣦⣠⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣶⣶⣿⢿⣿⣿⣿⣿⣿⣻⣿⣟⣿⣿⣷⣾⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⠀⢰⣿⣄⣼⣿⣆⠀⣀⣴⣾⣿⣻⣟⣷⣯⢿⡾⣯⣷⣿⣾⣯⣷⢿⡾⣿⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠀⣀⣸⣿⣿⣽⣯⣿⣻⣿⣟⣿⢾⣽⣟⣿⣻⣟⣿⣻⣯⡿⣾⣽⣟⣿⣽⣟⡿⣿⢿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⢠⣾⣿⣷⣽⣷⢿⣷⢟⣮⣿⣻⡿⣿⣻⣿⣽⣻⢾⣯⣿⣻⣛⠿⣾⣽⢷⡿⣾⣻⣟⣯⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n" +
	"⠀⠀⠀⠉⠙⢹⣷⢿⣯⡿⣿⢿⣟⣷⣿⣿⣿⣟⣯⣿⣻⢷⣿⡧⣿⢟⢮⣻⣟⣿⣽⣯⢿⣽⣿⠇\n" +
	"⠀⠀⠀⠀⣼⣿⣻⣿⣾⣿⣟⣿⡾⣿⢾⣽⣟⣿⣿⡾⣯⣿⣾⣷⣽⣳⣧⣿⢿⣷⢿⡾⣿⣞⡿⣿⡀\n" +
	"⠀⠀⠀⠀⠻⣟⢽⣿⣾⢯⣿⣾⣟⡿⣯⣿⣿⣽⢿⣟⣿⣽⣟⣾⣿⣯⢿⡾⣿⣽⣻⣟⣷⡿⣽⣿⣯\n" +
	"⠀⠀⠀⠀⠀⠀⠸⣿⣟⣿⣻⣾⣽⣿⣿⣻⣯⣿⣿⡿⣿⣾⣿⣿⣾⣻⣟⣿⣷⢿⣷⣯⣿⣽⢿⣾⠗\n" +
	"⠀⠀⠀⠀⠀⠀⢰⣿⣟⣿⢿⣿⡽⣷⣿⣿⡿⣿⡿⣿⣿⣿⣽⢷⣻⣽⣿⣿⣻⣿⣷⣿⣷⢿⠿⠉\n" +
	"⠀⠀⠀⠀⠀⠀⢸⣿⣯⣟⣿⣯⣿⣟⣿⣾⣿⣿⢿⣿⡿⣺⣷⣿⢿⡫⠷⠝⠽⠝⣟⢷⣿⣷⣄\n" +
	"⠀⠀⠀⠀⠀⠀⢘⣿⣾⢯⣿⣷⢿⡿⣿⣟⣿⣽⣿⣿⣝⣿⢿⠕⠁⠀⠀⢀⠄⠀⠀⠉⢻⢿⣿⣆\n" +
	"⠀⠀⠀⠀⠀⠀⠀⣿⣿⢯⣿⣿⣻⣿⣿⣿⣻⣾⣿⣮⣿⡿⡇⠀⠀⠀⢃⣈⣤⠄⡨⠀⠈⢻⣿⡿⡄\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠸⣿⣟⣷⢿⣿⣿⣯⣿⣽⣿⣿⢮⣿⣯⠇⠀⢀⡉⢴⡽⣙⠀⠄⠀⠀⣸⣿⣟⡇\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠹⣿⣯⡿⣿⣾⣿⡿⣾⣷⣿⣯⢿⣿⣣⠀⠀⠀⠯⠋⡁⠐⠀⠀⢠⣟⣿⢯⠂\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⡿⣿⣳⣿⣻⣿⣷⡿⣿⣿⣝⣿⣿⣷⣄⡀⠀⠀⠀⠈⣀⣴⣿⣿⣻⠃\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣻⣷⣿⣽⢿⣿⣿⣟⣿⣮⣟⣽⣿⣿⣷⣾⣾⣿⡿⣿⢯⣿⣾⣦⡀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⠿⡿⣿⣾⣽⣟⣿⢿⣿⣷⣷⣽⣽⣫⣟⣽⣽⡾⠓⠻⣿⣿⣿⣦⡄\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⠋⠟⢟⢿⢿⡷⣿⢿⢿⡻⢟⠟⠋⠈⠀⠀⠀⠑⠿⣿⣿⣿⣶⡀\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢷⡿⡯⠃\n" +
	"⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁"

const bannerFullWidth = 165
const bannerLogoWidth = 60

// RenderBanner returns a responsive banner based on terminal width.
func RenderBanner() string {
	cols := termWidth()

	// Wide terminal — full banner with logo + text art
	if cols >= bannerFullWidth {
		return BannerStyle.Render(bannerFull)
	}

	// Medium terminal — braille logo + text name below
	if cols >= bannerLogoWidth {
		return BannerStyle.Render(bannerLogo) + "\n" +
			BannerBold.Render("       D E C E P T I C O N")
	}

	// Narrow terminal — text only
	return BannerBold.Render("D E C E P T I C O N")
}

func termWidth() int {
	w, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || w <= 0 {
		return 80
	}
	return w
}

func Success(msg string) {
	Println(Green.Render("✓ " + msg))
}

func Warning(msg string) {
	Println(Yellow.Render("⚠ " + msg))
}

func Error(msg string) {
	Println(Red.Render("✗ " + msg))
}

func Info(msg string) {
	Println(Cyan.Render("● " + msg))
}

func DimText(msg string) {
	Println(Dim.Render(msg))
}

// NeutralWriter gives unstyled human-readable subprocess output the same ink
// as launcher messages. Interactive terminals and machine output bypass it.
type NeutralWriter struct{ Writer io.Writer }

func (w NeutralWriter) Write(p []byte) (int, error) {
	lines := strings.Split(string(p), "\n")
	for index, line := range lines {
		lines[index] = Text.Render(line)
	}
	styled := strings.Join(lines, "\n")
	n, err := colorprofile.NewWriter(w.Writer, os.Environ()).WriteString(styled)
	if err != nil {
		return 0, err
	}
	if n != len(styled) {
		return 0, io.ErrShortWrite
	}
	return len(p), nil
}

// DecepticonTheme gives forms recessed graphite fields and raised silver focus.
// A light-terminal ramp preserves legibility when Huh detects a light canvas.
func DecepticonTheme(isDark bool) *huh.Styles {
	t := huh.ThemeBase(isDark)
	text, focus, muted := ColorText, ColorFocus, ColorMuted
	surface, raised, border, ink := ColorSurface, ColorRaised, ColorBorder, ColorGround
	if !isDark {
		text, focus, muted = "#343434", "#141414", "#666666"
		surface, raised, border, ink = "#f4f4f4", "#dedede", "#aaaaaa", "#f4f4f4"
	}
	t.Form.Base = t.Form.Base.Foreground(lipgloss.Color(text))
	t.Group.Base = t.Group.Base.Foreground(lipgloss.Color(text))
	for _, field := range []*huh.FieldStyles{&t.Focused, &t.Blurred} {
		field.Base = field.Base.Foreground(lipgloss.Color(text))
		field.Title = field.Title.Foreground(lipgloss.Color(text)).Bold(true)
		field.Description = field.Description.Foreground(lipgloss.Color(muted))
		field.Option = field.Option.Foreground(lipgloss.Color(text))
		// Active (cursor) option carries its OWN background+foreground pair so
		// it stays legible regardless of how Huh detects the terminal canvas.
		// Relying on the field Base background alone fails when dark/light
		// detection flips (e.g. a WSL terminal that doesn't answer the OSC 11
		// background query): the ramp then paints near-black option text that
		// never receives the light Base fill, leaving an unreadable row. A
		// raised graphite fill + silver focus text mirrors the engagement
		// picker's selected row (internal/engagement/picker.go) and reads in
		// both ramps and on either real canvas.
		field.SelectedOption = field.SelectedOption.Foreground(lipgloss.Color(focus)).Background(lipgloss.Color(raised)).Bold(true)
		field.UnselectedOption = field.UnselectedOption.Foreground(lipgloss.Color(text))
		field.SelectedPrefix = field.SelectedPrefix.Foreground(lipgloss.Color(focus))
		field.UnselectedPrefix = field.UnselectedPrefix.Foreground(lipgloss.Color(muted))
		field.SelectSelector = field.SelectSelector.Foreground(lipgloss.Color(focus))
		field.MultiSelectSelector = field.MultiSelectSelector.Foreground(lipgloss.Color(focus))
		field.ErrorIndicator = field.ErrorIndicator.Foreground(lipgloss.Color(focus)).Bold(true)
		field.ErrorMessage = field.ErrorMessage.Foreground(lipgloss.Color(focus)).Bold(true)
		field.TextInput.Text = field.TextInput.Text.Foreground(lipgloss.Color(text)).Background(lipgloss.Color(surface))
		field.TextInput.Placeholder = field.TextInput.Placeholder.Foreground(lipgloss.Color(muted)).Background(lipgloss.Color(surface))
		field.TextInput.Cursor = field.TextInput.Cursor.Foreground(lipgloss.Color(focus))
		field.TextInput.CursorText = field.TextInput.CursorText.Foreground(lipgloss.Color(text))
		field.TextInput.Prompt = field.TextInput.Prompt.Foreground(lipgloss.Color(muted))
		field.FocusedButton = field.FocusedButton.Background(lipgloss.Color(focus)).Foreground(lipgloss.Color(ink)).Bold(true)
		field.BlurredButton = field.BlurredButton.Background(lipgloss.Color(raised)).Foreground(lipgloss.Color(text))
		field.Card = field.Card.Foreground(lipgloss.Color(text)).BorderForeground(lipgloss.Color(border))
		field.NoteTitle = field.NoteTitle.Foreground(lipgloss.Color(focus)).Bold(true)
		field.Next = field.Next.Foreground(lipgloss.Color(muted))
		field.NextIndicator = field.NextIndicator.Foreground(lipgloss.Color(muted))
		field.PrevIndicator = field.PrevIndicator.Foreground(lipgloss.Color(muted))
		field.Directory = field.Directory.Foreground(lipgloss.Color(text))
		field.File = field.File.Foreground(lipgloss.Color(text))
	}
	t.Focused.Base = t.Focused.Base.BorderForeground(lipgloss.Color(focus)).Background(lipgloss.Color(surface)).PaddingRight(1)
	t.Blurred.Base = t.Blurred.Base.BorderForeground(lipgloss.Color(border))
	t.Group.Title = lipgloss.NewStyle().Foreground(lipgloss.Color(focus)).Bold(true).PaddingBottom(1)
	t.Group.Description = lipgloss.NewStyle().Foreground(lipgloss.Color(muted))
	return t
}

func Println(args ...any) { fmt.Fprintln(NeutralWriter{Writer: os.Stdout}, args...) }
func Printf(format string, args ...any) {
	fmt.Fprintf(NeutralWriter{Writer: os.Stdout}, format, args...)
}

// RunField keeps startup/update/consent prompts on the same theme as onboarding.
func RunField(field huh.Field) error {
	return huh.NewForm(huh.NewGroup(field)).WithTheme(huh.ThemeFunc(DecepticonTheme)).Run()
}
