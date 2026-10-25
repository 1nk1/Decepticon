package engagement

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/ui"
	"testing"
)

func TestPickerMouseSelectsWithoutOpeningAndWheelClamps(t *testing.T) {
	t.Setenv("DECEPTICON_MOUSE", "1")
	m := newPickerModel(t.TempDir(), []EngagementEntry{{Slug: "alpha"}, {Slug: "beta"}})
	next, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m = next.(pickerModel)
	top := lipgloss.Height(m.list.Styles.TitleBar.Render(m.list.Styles.Title.Render(m.list.Title)))
	next, _ = m.Update(tea.MouseClickMsg{X: 4, Y: top + 3, Button: tea.MouseLeft})
	m = next.(pickerModel)
	if m.list.Index() != 1 || m.result != resultPending {
		t.Fatalf("click selected %d / result %d", m.list.Index(), m.result)
	}
	for range 5 {
		next, _ = m.Update(tea.MouseWheelMsg{Button: tea.MouseWheelDown})
		m = next.(pickerModel)
	}
	if m.list.Index() != 2 {
		t.Fatalf("wheel must stop at last entry, got %d", m.list.Index())
	}
	t.Setenv("DECEPTICON_MOUSE", "0")
	next, _ = m.Update(tea.MouseClickMsg{X: 4, Y: top, Button: tea.MouseLeft})
	m = next.(pickerModel)
	if m.list.Index() != 2 || m.View().MouseMode != tea.MouseModeNone {
		t.Fatal("disabled mouse changed selection or enabled capture")
	}
	old := ui.DisableMouse
	ui.DisableMouse = true
	defer func() { ui.DisableMouse = old }()
	if m.View().MouseMode != tea.MouseModeNone {
		t.Fatal("launcher no-mouse flag was ignored")
	}
}
