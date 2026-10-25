package ui

import (
	"fmt"
	"os"

	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
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

var (
	// Keep exported style names for callers; status also has an icon and text.
	Red         = lipgloss.NewStyle().Foreground(lipgloss.Color("#f4f4f4")).Bold(true)
	Green       = lipgloss.NewStyle().Foreground(lipgloss.Color("#c4c4c4"))
	Yellow      = lipgloss.NewStyle().Foreground(lipgloss.Color("#dedede")).Bold(true)
	Cyan        = lipgloss.NewStyle().Foreground(lipgloss.Color("#b8b8b8"))
	Dim         = lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMuted))
	Bold        = lipgloss.NewStyle().Bold(true)
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
	fmt.Println(Green.Render("✓ " + msg))
}

func Warning(msg string) {
	fmt.Println(Yellow.Render("⚠ " + msg))
}

func Error(msg string) {
	fmt.Println(Red.Render("✗ " + msg))
}

func Info(msg string) {
	fmt.Println(Cyan.Render("● " + msg))
}

func DimText(msg string) {
	fmt.Println(Dim.Render(msg))
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
	for _, field := range []*huh.FieldStyles{&t.Focused, &t.Blurred} {
		field.Base = field.Base.Foreground(lipgloss.Color(text))
		field.Title = field.Title.Foreground(lipgloss.Color(text)).Bold(true)
		field.Description = field.Description.Foreground(lipgloss.Color(muted))
		field.Option = field.Option.Foreground(lipgloss.Color(text))
		field.SelectedOption = field.SelectedOption.Foreground(lipgloss.Color(focus)).Bold(true)
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
		field.TextInput.Prompt = field.TextInput.Prompt.Foreground(lipgloss.Color(muted))
		field.FocusedButton = field.FocusedButton.Background(lipgloss.Color(focus)).Foreground(lipgloss.Color(ink)).Bold(true)
		field.BlurredButton = field.BlurredButton.Background(lipgloss.Color(raised)).Foreground(lipgloss.Color(text))
		field.Card = field.Card.BorderForeground(lipgloss.Color(border))
		field.NoteTitle = field.NoteTitle.Foreground(lipgloss.Color(focus)).Bold(true)
		field.Next = field.Next.Foreground(lipgloss.Color(muted))
		field.NextIndicator = field.NextIndicator.Foreground(lipgloss.Color(muted))
		field.PrevIndicator = field.PrevIndicator.Foreground(lipgloss.Color(muted))
		field.Directory = field.Directory.Foreground(lipgloss.Color(text))
	}
	t.Focused.Base = t.Focused.Base.BorderForeground(lipgloss.Color(focus)).Background(lipgloss.Color(surface)).PaddingRight(1)
	t.Blurred.Base = t.Blurred.Base.BorderForeground(lipgloss.Color(border))
	t.Group.Title = lipgloss.NewStyle().Foreground(lipgloss.Color(focus)).Bold(true).PaddingBottom(1)
	t.Group.Description = lipgloss.NewStyle().Foreground(lipgloss.Color(muted))
	return t
}
