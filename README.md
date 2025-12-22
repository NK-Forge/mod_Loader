# Space Marine 2 Mod Loader
A safe and lightweight mod manager and launcher for WH40K: Space Marine 2.

## Overview

The Space Marine 2 Mod Loader is a Windows desktop application designed to make modding simple, reliable, and safe. It provides:

- Automatic detection of Steam or Epic installations
- Automatic detection of save and config directories
- A dedicated Mods Vault to organize and manage mods
- A separate Mod Play Vault to isolate modded saves
- Toggle-based mod enabling and disabling
- Clean launching of Space Marine 2 in either modded or vanilla mode
- Automatic save mirroring after modded sessions
- Manual save mirroring on demand
- A Watcher Activity panel that shows real-time file activity

No game files are ever overwritten. Modding is completely reversible, and returning to vanilla play is always safe.

This tool is Windows-only.

### Important: Epic Games Support Is Experimental

Epic platform support is included but not fully tested.  
Some features may not behave as expected when using the Epic version of Space Marine 2.  
If you choose to use Epic, please be aware that this functionality is still in an early testing stage.


---

## Installation

### Download
Download the installer from Nexus Mods:

`SpaceMarine2_ModLoader_Setup.exe`

### Installation Steps
1. Run the installer.
2. If Windows shows a security warning, click **More Info → Run Anyway**.
   This occurs because the installer is not yet code-signed.
3. Launch the Mod Loader when installation completes.

---

## Initial Setup

On first launch, the Setup Wizard will attempt to auto-detect:

- Steam or Epic installation
- Space Marine 2 game directory
- Game save and config directory
- Mods Vault directory
- Mod Play Vault directory

If a directory cannot be auto-detected, the wizard will prompt you to select it manually.  
After validation, you will enter the main Mod Manager.

---

## Mods Vault

The Mods Vault is where your mod files are stored when not in use.

- Extract mods into either the official SM2 mods folder or the Mods Vault.
- The Mod Loader scans and lists available mods.
- If mods are added while the app is running, click **Refresh** to reload the list.

Mods are not overwritten or removed by the Mod Loader. The loader links or copies files as needed for modded play.

---

## Enabling and Disabling Mods

1. Open the Mod Manager.
2. Toggle mods on or off.
3. Click **Apply (no launch)** to commit changes without launching the game.

This allows you to configure mods ahead of time.

---

## Save Mirroring

The Mod Loader separates modded progress from vanilla progression using a dedicated Mod Play Vault.

### Manual Save

Click **Manual Save** to mirror all current save and config files into the Mod Play Vault.

Important note:  
If your last game session was **vanilla play**, using Manual Save will mirror those vanilla saves into the Mod Play Vault.

If you want to preserve modded saves before using Manual Save:

1. Open the Mod Play Vault folder.
2. Go one directory up into `space_marine_2_mod_manager`.
3. Copy and rename the `mod_play_vault` folder (for example: `mod_play_vault_backup`).
4. You may delete the backup later if everything is correct.

### Automatic Save Mirroring

After modded play:
If the Launcher was left open and running in the background

1. The Mod Loader monitors save/config activity.
2. When the game closes, the loader detects the exit.
3. It mirrors updated save files back into the Mod Play Vault.

Automatic mirroring does not occur in vanilla mode.
We leave Vanilla to Steam or Epic Clouds to handle.

---

## Launching Space Marine 2

### Mod Play (with mods)

1. Enable at least one mod.
2. Click **Launch (Mod Play)**.

The loader will:

- Mirror Mod Play Vault saves into the game’s config directory
- Launch Space Marine 2 via Steam or Epic URI
- Monitor the game process
- When the game exits, automatically mirror updated saves back into the Mod Play Vault

### Vanilla Play (no mods)

1. Disable all mods.
2. Click **Launch (Vanilla Play)**.

The loader launches the game with no mods active and does not mirror saves.

---

## Watcher Activity Panel

The Watcher Activity panel logs:

- Save file changes
- Config file changes
- Mod Vault file activity
- Backup and restore operations
- Mirror events before launch and after exit

Click **Clear** to remove the displayed log (this does not affect files).

---

## File Locations

Default directories (paths vary by username):

**Mods Vault**  
```md
C:\Users<username>\AppData\Roaming\space_marine_2_mod_manager\mods_vault
```


**Mod Play Vault**  
```md
C:\Users<username>\AppData\Roaming\space_marine_2_mod_manager\mod_play_vault
```


**Save/Config Directory**  
Automatically detected under the Saber directory ending in `\config\`.

---

## Troubleshooting

**Mods not showing up**  
- Mods must be extracted into the correct folder.
- Use **Refresh** if added during runtime.

**Game not launching**  
- Ensure Steam or Epic Games Launcher is running.
- Verify correct paths under Options.

**Manual Save mirrored zero files**  
- Files may not have changed since the last mirror.
- Confirm you are in modded mode if expecting changes.

**Auto-detect failed**  
- Some custom installations may require manual path selection.

---

## Recommended Workflow

### 1. Initial Setup
1. Launch the Mod Loader.
2. Complete the Setup Wizard to detect installs, saves, and vault folders.
3. Confirm all paths are correct before entering the Mod Manager.

### 2. Add and Prepare Mods
1. Place mods into the SM2 mods folder or Mods Vault.
2. If added during runtime, click **Refresh** to update the list.

### 3. Configure Mods
1. Toggle mods on or off.
2. Click **Apply (no launch)** to update configuration.

### 4. Launch the Game
- Enable mods and click **Launch (Mod Play)** for modded play.
- Disable all mods and click **Launch (Vanilla Play)** for vanilla play.

### 5. Preserve Progress
1. Leave the Mod Loader open during gameplay.
2. The loader tracks save activity during modded sessions.
3. Upon game exit, it automatically mirrors saves into the Mod Play Vault.

### 6. Manual Save (Optional)
Click **Manual Save** at any time to explicitly mirror save data into the Mod Play Vault.  
Back up the vault first if unsure of your current play mode.

---

## Support

For assistance, include:

- Platform (Steam or Epic)
- Windows version
- Description of the issue
- Logs or screenshots when possible

Support email: dev@nkforge.com

---

## Thank You

Thank you for using the Space Marine 2 Mod Loader.  
Your feedback helps improve future versions and modding support.
