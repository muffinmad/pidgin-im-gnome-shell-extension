.PHONY: build

build:
	@mkdir -p build
	@rm build/pidgin@muffinmad.zip
	@zip build/pidgin@muffinmad.zip \
		locale/de/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		locale/fr/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		locale/uk/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		schemas/* LICENSE dbus.js extension.js metadata.json prefs.js
