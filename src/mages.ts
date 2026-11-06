// The five mages. A mage's colour fixes its element for the whole match.
// Ultimates are each mage's own (names from the PO, 2026-11-07). Skill slots 1–3 are
// placeholders until the PO assigns each mage's three real skills.

export type MageInfo = {
  /** Colour name shown to the player. */
  name: string
  element: string
  /** The mage's signature Ultimate. */
  ultName: string
  /** What the element beam (placeholder Skill 1) does. */
  beam: string
  /** CSS accent colour for cards and buttons. */
  css: string
  /** Robe colour in the arena. */
  robe: number
}

export const MAGES: readonly MageInfo[] = [
  { name:'Red', element:'Fire', ultName:'Hell Fire', beam:'Torrent of flame: highest damage.', css:'#ff5a3a', robe:0x8a2f2a },
  { name:'Yellow', element:'Gold Threads', ultName:'Giant Sword', beam:'Threads that slow and drain mana.', css:'#ffc94a', robe:0x8f7428 },
  { name:'Blue', element:'Frost', ultName:'Sharp Blizzard', beam:'Crystal shield: blocks beams, reflects attacks.', css:'#6fd3ff', robe:0x2c4f8f },
  { name:'White', element:'Light', ultName:'Soul Drain', beam:'Piercing light that cuts through Frost.', css:'#f4f1e6', robe:0xb9bcc8 },
  { name:'Green', element:'Nature', ultName:'Huge Rocks', beam:'Vines and poison: damage over time, short root.', css:'#5fd36a', robe:0x2f6f3c },
]

/** Placeholder skill slots, the same for every mage until real skills are assigned. */
export const PLACEHOLDER_SKILLS = ['Beam','Blink','Locked'] as const
