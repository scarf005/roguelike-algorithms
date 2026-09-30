
# Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path make/windows.mk; vendored and modified for this integration.
windows/resources.o: windows/resources.rc make/windows.mk
	windres $< $@
