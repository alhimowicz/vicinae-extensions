/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Chrome Variant - Which Chrome installation to use */
	"chromeVariant": "auto" | "flatpak" | "native";
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Chrome Profiles */
	export type ChromeProfiles = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Chrome Profiles */
	export type ChromeProfiles = {
		
	}
}