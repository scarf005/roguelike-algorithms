
# Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path make/os2.mk; vendored and modified for this integration.
os2/icon.res: os2/icon.rc make/os2.mk
	wrc -qr $< -fo=$@

os2/brogue.lib: os2/brogue.def make/os2.mk
	emximp -o $@ $<
