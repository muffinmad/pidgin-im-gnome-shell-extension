.PHONY: build

build:
	@mkdir -p build
	@zip build/pidgin@muffinmad.zip \
		locale/de/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		locale/fr/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		locale/uk/LC_MESSAGES/gnome-shell-extension-pidgin.mo \
		schemas/* LICENSE dbus.js dbus.xml extension.js metadata.json prefs.js
