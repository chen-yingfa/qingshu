import keybindingsJson from '../keybindings.json'
type KeybindingType = { [k: string]: string }
export var keybindings = keybindingsJson as KeybindingType
