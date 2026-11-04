import type { FormationDefinition, FormationSlot, FormationId } from '../domain/teams.js';

/** Shared anchors are in the team's attacking direction, independent of camera. */
const slots = {
  GK: { id: 'GK', label: 'KL', position: 'GK', side: 'center', anchor: { x: .05, z: .5 }, unit: 'goalkeeper' },
  LB: { id: 'LB', label: 'Sol bek', position: 'FB', side: 'left', anchor: { x: .25, z: .12 }, unit: 'defense' },
  LCB: { id: 'LCB', label: 'Sol stoper', position: 'CB', side: 'left', anchor: { x: .21, z: .35 }, unit: 'defense' },
  CB: { id: 'CB', label: 'Stoper', position: 'CB', side: 'center', anchor: { x: .20, z: .50 }, unit: 'defense' },
  RCB: { id: 'RCB', label: 'Sağ stoper', position: 'CB', side: 'right', anchor: { x: .21, z: .65 }, unit: 'defense' },
  RB: { id: 'RB', label: 'Sağ bek', position: 'FB', side: 'right', anchor: { x: .25, z: .88 }, unit: 'defense' },
  LWB: { id: 'LWB', label: 'Sol kanat bek', position: 'FB', side: 'left', anchor: { x: .40, z: .10 }, unit: 'defense' },
  RWB: { id: 'RWB', label: 'Sağ kanat bek', position: 'FB', side: 'right', anchor: { x: .40, z: .90 }, unit: 'defense' },
  LDM: { id: 'LDM', label: 'Sol merkez', position: 'CM', side: 'left', anchor: { x: .41, z: .36 }, unit: 'midfield' },
  RDM: { id: 'RDM', label: 'Sağ merkez', position: 'CM', side: 'right', anchor: { x: .41, z: .64 }, unit: 'midfield' },
  DM: { id: 'DM', label: 'Ön libero', position: 'CM', side: 'center', anchor: { x: .36, z: .50 }, unit: 'midfield' },
  LCM: { id: 'LCM', label: 'Sol orta saha', position: 'CM', side: 'left', anchor: { x: .51, z: .33 }, unit: 'midfield' },
  RCM: { id: 'RCM', label: 'Sağ orta saha', position: 'CM', side: 'right', anchor: { x: .51, z: .67 }, unit: 'midfield' },
  CAM: { id: 'CAM', label: 'Hücumcu orta saha', position: 'CAM', side: 'center', anchor: { x: .65, z: .5 }, unit: 'midfield' },
  LM: { id: 'LM', label: 'Sol kanat', position: 'W', side: 'left', anchor: { x: .54, z: .13 }, unit: 'midfield' },
  RM: { id: 'RM', label: 'Sağ kanat', position: 'W', side: 'right', anchor: { x: .54, z: .87 }, unit: 'midfield' },
  LW: { id: 'LW', label: 'Sol açık', position: 'W', side: 'left', anchor: { x: .69, z: .13 }, unit: 'attack' },
  RW: { id: 'RW', label: 'Sağ açık', position: 'W', side: 'right', anchor: { x: .69, z: .87 }, unit: 'attack' },
  LS: { id: 'LS', label: 'Sol forvet', position: 'ST', side: 'left', anchor: { x: .82, z: .38 }, unit: 'attack' },
  RS: { id: 'RS', label: 'Sağ forvet', position: 'ST', side: 'right', anchor: { x: .82, z: .62 }, unit: 'attack' },
  ST: { id: 'ST', label: 'Forvet', position: 'ST', side: 'center', anchor: { x: .84, z: .50 }, unit: 'attack' },
} as const satisfies Record<string, FormationSlot>;

export const FORMATIONS = {
  '4-2-3-1': { id: '4-2-3-1', label: '4-2-3-1', slots: [slots.GK, slots.LB, slots.LCB, slots.RCB, slots.RB, slots.LDM, slots.RDM, slots.LW, slots.CAM, slots.RW, slots.ST] },
  '4-3-3': { id: '4-3-3', label: '4-3-3', slots: [slots.GK, slots.LB, slots.LCB, slots.RCB, slots.RB, slots.DM, slots.LCM, slots.RCM, slots.LW, slots.RW, slots.ST] },
  '4-4-2': { id: '4-4-2', label: '4-4-2', slots: [slots.GK, slots.LB, slots.LCB, slots.RCB, slots.RB, slots.LM, slots.LCM, slots.RCM, slots.RM, slots.LS, slots.RS] },
  '3-5-2': { id: '3-5-2', label: '3-5-2', slots: [slots.GK, slots.LCB, slots.CB, slots.RCB, slots.LM, slots.LCM, slots.DM, slots.RCM, slots.RM, slots.LS, slots.RS] },
  '5-3-2': { id: '5-3-2', label: '5-3-2', slots: [slots.GK, slots.LWB, slots.LCB, slots.CB, slots.RCB, slots.RWB, slots.DM, slots.LCM, slots.RCM, slots.LS, slots.RS] },
} as const satisfies Readonly<Record<FormationId, FormationDefinition>>;
