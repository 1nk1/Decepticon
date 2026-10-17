package cmd

func applyResumeEnv(env map[string]string, thread string, latest bool) {
	switch {
	case latest:
		env["DECEPTICON_RESUME_LATEST"] = "true"
	case thread == "picker":
		env["DECEPTICON_RESUME_PICKER"] = "true"
	case thread != "":
		env["DECEPTICON_THREAD_ID"] = thread
	}
}
