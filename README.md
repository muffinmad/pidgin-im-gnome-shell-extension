# pidgin-im-gnome-shell-extension

Make Pidgin IM conversations appear in the Gnome Shell message tray

## Features

- Supports Chats and IMs for now (i.e. no file transfers or attentions)
- User icons
- User status as secondary icon
- Sends typing state
- Shows unread messages count
- Tries to restore unread messages count after screen lock/unlock
- Search provider for buddys from connected accounts (can be disabled from extension preferences)

## Issues

- Messages appear unseen in Pidgin after expanding notification in message tray. Don't know how to set unseen state in Pidgin
- No notifications on locked screen even if notification settings allow it. Because Gnome Shell disables all extensions on screen lock

## Supported Gnome Shell Versions
- v31: 3.10 - 3.30
- v32: 3.32
- v36: 3.36
- v40: 40 - 42

## Installation

### Requirements

Because notifications used in this extension are based on Telepathy clien ones, shipped with gnome-shell, Telepathy typelib must be installed.

As for Ubuntu 20.04 this is `gir1.2-telepathyglib-0.12` and `gir1.2-telepathylogger-0.2` packages.

### GNOME Shell Extensions

https://extensions.gnome.org/extension/782/pidgin-im-integration/

### Manual
    mkdir -p $HOME/.local/share/gnome-shell/extensions
    cd $HOME/.local/share/gnome-shell/extensions
    git clone git://github.com/muffinmad/pidgin-im-gnome-shell-extension.git pidgin@muffinmad
Restart GNOME Shell and enable "Pidgin IM integration" extension
