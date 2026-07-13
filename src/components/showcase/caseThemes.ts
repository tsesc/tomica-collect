import type { CSSProperties } from 'react'
import type { CaseTheme } from '../../hooks/useCollectionLayout'

/**
 * Case materials for the collection showcase. Each theme restyles the tile
 * frame (the border material), the compartment interior, the shelf ledge,
 * the label plate and the case body behind the grid.
 */
export interface CaseThemeSpec {
  label: string
  /** Outer frame of each tile — the physical border material. */
  frame: string
  frameStyle?: CSSProperties
  /** Padding the frame adds around the compartment (wood is chunky, acrylic thin). */
  framePad: string
  /** Compartment interior behind the car. */
  compartmentStyle: CSSProperties
  /** Shelf ledge at the bottom of the compartment. */
  ledge: string
  /** Extra overlay inside the compartment (e.g. acrylic glare). */
  overlay?: string
  overlayStyle?: CSSProperties
  /** Label plate under the compartment. */
  plate: string
  plateCode: string
  plateName: string
  plateSub: string
  /** Panel behind the whole grid — the case body. */
  caseBody: string
  /** Recessed empty slot shown while a car is picked up. */
  slot: string
  /** drop-shadow for the car artwork. */
  carShadow: string
  carShadowLifted: string
  /** Swatch for the material picker. */
  swatch: string
  swatchStyle?: CSSProperties
}

export const CASE_THEMES: Record<CaseTheme, CaseThemeSpec> = {
  classic: {
    label: '經典白',
    frame: 'bg-white ring-1 ring-outline-variant/40',
    framePad: 'p-0',
    compartmentStyle: {
      background: 'radial-gradient(130% 90% at 50% -10%, #ffffff 40%, #fdf1ef 100%)',
    },
    ledge: 'bg-gradient-to-t from-[#f3ded9]/90 to-transparent',
    plate: 'bg-white',
    plateCode: 'text-primary',
    plateName: 'text-on-surface',
    plateSub: 'text-on-surface-variant',
    caseBody: '',
    slot: 'border-outline-variant/70 bg-surface-container-low/60',
    carShadow: 'drop-shadow(0 8px 7px rgba(39,24,22,0.16))',
    carShadowLifted: 'drop-shadow(0 18px 14px rgba(39,24,22,0.28))',
    swatch: 'bg-white ring-1 ring-outline-variant',
  },

  wood: {
    label: '木櫃',
    frame: 'shadow-[inset_0_2px_2px_rgba(255,238,210,0.55),inset_0_-2px_3px_rgba(58,32,12,0.55),0_2px_6px_rgba(58,32,12,0.25)]',
    frameStyle: {
      background:
        'linear-gradient(180deg, rgba(255,232,190,0.28), rgba(62,34,14,0.34)), repeating-linear-gradient(100deg, #8a5a33 0px, #96653c 7px, #7e5230 14px, #8f5f38 21px, #83552f 28px)',
    },
    framePad: 'p-[7px]',
    compartmentStyle: {
      background: 'radial-gradient(130% 90% at 50% -10%, #fffdf6 35%, #f2e3c6 100%)',
    },
    ledge: 'bg-gradient-to-t from-[#d9bc8f]/95 to-transparent',
    plate: 'bg-[#6e4726] shadow-[inset_0_1px_1px_rgba(255,236,200,0.35)]',
    plateCode: 'text-[#ffd9a0]',
    plateName: 'text-[#f9edd8]',
    plateSub: 'text-[#e0c9a4]/85',
    caseBody: 'rounded-3xl p-2.5 md:p-3 bg-[#f3e7d2]/60 ring-1 ring-[#d9c3a0]/50',
    slot: 'border-[#b08d5d]/80 bg-[#efe0c4]/70',
    carShadow: 'drop-shadow(0 8px 7px rgba(74,44,16,0.28))',
    carShadowLifted: 'drop-shadow(0 18px 14px rgba(74,44,16,0.4))',
    swatch: '',
    swatchStyle: {
      background: 'repeating-linear-gradient(100deg, #8a5a33 0px, #96653c 4px, #7e5230 8px, #8f5f38 12px)',
    },
  },

  acrylic: {
    label: '壓克力',
    frame:
      'bg-white/45 backdrop-blur-md ring-1 ring-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(150,175,200,0.35),0_4px_16px_-6px_rgba(100,130,160,0.35)]',
    framePad: 'p-[5px]',
    compartmentStyle: {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(233,240,246,0.55) 100%)',
    },
    ledge: 'bg-gradient-to-t from-[#d7e2ea]/90 to-transparent',
    overlay: 'pointer-events-none absolute inset-0',
    overlayStyle: {
      background:
        'linear-gradient(115deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 22%, transparent 34%)',
    },
    plate: 'bg-white/60 backdrop-blur-sm',
    plateCode: 'text-tertiary',
    plateName: 'text-on-surface',
    plateSub: 'text-on-surface-variant',
    caseBody: 'rounded-3xl p-2.5 md:p-3 bg-gradient-to-b from-[#eef4f8]/80 to-[#e5ecf2]/50 ring-1 ring-white/70',
    slot: 'border-[#a9c0d2]/80 bg-white/40',
    carShadow: 'drop-shadow(0 8px 7px rgba(70,95,120,0.2))',
    carShadowLifted: 'drop-shadow(0 18px 14px rgba(70,95,120,0.32))',
    swatch: '',
    swatchStyle: {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, #dbe7f0 55%, #c3d5e2 100%)',
    },
  },

  velvet: {
    label: '黑絨展示櫃',
    frame: 'bg-[#241a1b] ring-1 ring-[#4a3436] shadow-[inset_0_1px_1px_rgba(255,220,210,0.08),0_4px_14px_-4px_rgba(0,0,0,0.5)]',
    framePad: 'p-[5px]',
    compartmentStyle: {
      background: 'radial-gradient(120% 95% at 50% -10%, #55403c 0%, #2c2021 62%, #241a1b 100%)',
    },
    ledge: 'bg-gradient-to-t from-black/55 to-transparent',
    plate: 'bg-[#1b1314]',
    plateCode: 'text-[#ff8a80]',
    plateName: 'text-[#f5e8e6]',
    plateSub: 'text-[#c9b2ae]/80',
    caseBody: 'rounded-3xl p-2.5 md:p-3 bg-[#171011] ring-1 ring-[#39292b]',
    slot: 'border-[#5a4345] bg-[#2a1e1f]/80',
    carShadow: 'drop-shadow(0 10px 9px rgba(0,0,0,0.55))',
    carShadowLifted: 'drop-shadow(0 20px 16px rgba(0,0,0,0.7))',
    swatch: '',
    swatchStyle: {
      background: 'radial-gradient(100% 100% at 50% 0%, #55403c 0%, #241a1b 80%)',
    },
  },
}

export const THEME_ORDER: CaseTheme[] = ['classic', 'wood', 'acrylic', 'velvet']
