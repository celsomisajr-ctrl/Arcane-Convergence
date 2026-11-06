// The five mages. A mage's colour fixes its element for the whole match; element skills
// will be built per mage. Indices match the element constants in sim.ts.

export type MageInfo = {
  /** Colour name shown to the player. */
  name: string
  element: string
  /** What the Ultimate (Channel) does. */
  ultimate: string
  /** CSS accent colour for the select card. */
  css: string
  /** Robe colour in the arena. */
  robe: number
}

export const MAGES: readonly MageInfo[] = [
  { name:'Red', element:'Fire', ultimate:'A roaring torrent of flame. Highest damage.', css:'#ff5a3a', robe:0x8a2f2a },
  { name:'Yellow', element:'Gold Threads', ultimate:'Binding threads that slow the target and drain its mana.', css:'#ffc94a', robe:0x8f7428 },
  { name:'Blue', element:'Frost', ultimate:'A crystal shield that blocks beams and reflects bolts.', css:'#6fd3ff', robe:0x2c4f8f },
  { name:'White', element:'Light', ultimate:'A piercing beam that cuts straight through Frost shields.', css:'#f4f1e6', robe:0xb9bcc8 },
  { name:'Green', element:'Nature', ultimate:'Vines and poison: damage over time and a short root.', css:'#5fd36a', robe:0x2f6f3c },
]
