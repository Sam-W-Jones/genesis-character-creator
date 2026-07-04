# Genesis — Cinematic Character Creator
### A Foundry VTT v12 module for the D&D 5e system

A video-game style, step-by-step character creation wizard: **Identity → Class & Level → Subclass → Species → Background → Equipment → Abilities → Review → Forge.** Big art cards, a progress rail, and a dark cinematic look — with all the actual rules work delegated to the dnd5e system's native **Advancement** engine, so features, hit points, proficiencies, and choices are granted exactly as the system intends, at creation and on every future level-up.

## Requirements
- Foundry VTT **v12**
- The **dnd5e** system, 3.0+
- At least one compendium (or world items) containing classes/subclasses/species/backgrounds — e.g. the SRD content that ships with the dnd5e system. Homebrew items work as long as they use standard dnd5e Advancements.

## Installation
1. Copy the `genesis-character-creator` folder into `Data/modules/` (so `Data/modules/genesis-character-creator/module.json` exists).
2. Enable **Genesis — Cinematic Character Creator** in **Manage Modules**.

## Usage
- A **"Forge a Hero"** button appears at the top of the **Actors** sidebar (for the GM always; for players if the setting allows). A macro can also call `game.modules.get("genesis-character-creator").api.open()`.
- The wizard walks through:
  1. **Identity** — name + portrait (tap the portrait to open the file picker).
  2. **Class & starting level** — art cards for every class found in your compendiums, plus a level slider (1 up to the GM-configured cap).
  3. **Subclass** — filtered to the chosen class. If the starting level is below the subclass threshold, the subclass item still lands on the sheet and activates when the character qualifies (native dnd5e behavior). Skippable.
  4. **Species** and **Background** — art cards, skippable.
  5. **Starting Equipment** — reads the dnd5e 3.1+ structured `startingEquipment` on your class and background: either/or choices render as selectable options, and category picks ("any simple weapon", "a musical instrument") become dropdowns of matching gear from your compendiums. If the class defines a `wealth` formula, a **"take starting gold instead"** toggle replaces the class kit with a rolled gold total (rolled to chat at forge time). Items that predate structured equipment (prose-only gear lists) are flagged so you can add their kit from compendiums after creation. Skippable.
  6. **Abilities** — Standard Array (assign via dropdowns), Point Buy (27 points, 8–15), or Manual/Rolled entry. Modifiers preview live; racial/background bonuses apply on top when those items land, per the system.
  7. **Review → Forge** — creates the actor, then drops the real species, background, class (at the chosen level), and subclass items onto it **in PHB order**, waiting for each dnd5e **Advancement Manager** dialog chain to finish before the next item drops. Answer the dialogs as they appear (HP per level, choices, etc.). Your chosen equipment (and/or rolled gold) lands after advancements complete. When the dust settles, the finished sheet opens.

## GM: assigning class art
**Game Settings → Configure Settings → Genesis → Configure Class Art.** Every class discovered in your compendiums gets a row: paste an image path or use the picker. Blank rows fall back to the class item's own icon. Art is stored per class *identifier*, so it applies no matter which compendium the class is picked from.

Other GM settings: show/hide the player button, and the **maximum starting level** the slider allows.

## How level-up works after creation
Nothing special — that's the point. The class on the sheet is the real dnd5e class item, so raising its level (or dropping in a multiclass) triggers the system's own Advancement flow, and features keep granting themselves natively.

## Honest limitations
- **Player permissions:** by default Foundry does not let players create Actors. Grant players the *Create New Actors* permission (Configure Players → Permissions) or have the GM run the wizard for them. The review step warns when the current user can't create.
- **Advancement dialogs are the system's own** — Genesis deliberately does not reimplement spell selection UIs; whatever the dnd5e Advancement Manager asks (HP, scale values, item grants, choices) is exactly what you get. Spells beyond what advancements grant should be added from compendiums afterward.
- **Starting equipment** requires dnd5e 3.1+ structured data on the class/background item. Category dropdowns are matched against your compendium gear by dnd5e type keys; an exotic homebrew category that matches nothing renders as "pick from compendiums later" rather than blocking creation. Higher-level characters' extra wealth/magic items (DMG-style) are a table decision and are not automated.
- **Ability bonuses:** the wizard sets base scores; racial/background ability improvements arrive with their items via advancement (dnd5e 3.x models these on the items). If your species items are old-style (no advancement), apply their bonuses manually.
- **High starting levels** produce a long (but correct) chain of advancement prompts — that's dnd5e walking each level honestly.
- The creation waits for advancement windows by watching for the manager to close; if a player force-closes an advancement mid-chain, the remaining items still drop, and anything skipped can be re-run from the class item's advancement tab.
- Built and syntax-validated against the dnd5e 3.x data model on v12; I can't execute Foundry in this environment, so if a sheet/system point release moves a selector or hook, expect the fix to be small — the module is deliberately thin over native machinery.

## Uninstalling
Disable the module. Characters it created are ordinary actors and are unaffected.
