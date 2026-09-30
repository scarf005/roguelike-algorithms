
# Source provenance: Brogue CE v1.15.1, commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; upstream path make/brogue.mk; vendored and modified for this integration.
bin/brogue bin/brogue.exe: $(objects) vars/cflags vars/LDFLAGS vars/libs vars/objects make/brogue.mk
	$(CC) $(cflags) $(LDFLAGS) -o $@ $(objects) $(libs)
