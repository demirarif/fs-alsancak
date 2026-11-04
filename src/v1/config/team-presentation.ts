import type { TeamId } from '../domain/common.js';

export const TEAM_PRESENTATION = {
  'team-1': { name: 'Mavi Takım', color: '#458cff', shorts: '#2351a5', socks: '#4388f1', keeper: '#f1f2ed', marker: 'circle' },
  'team-2': { name: 'Kırmızı Takım', color: '#ef4c5d', shorts: '#9d293a', socks: '#e54454', keeper: '#181b22', marker: 'square' },
} as const satisfies Record<TeamId, { name:string; color:string; shorts:string; socks:string; keeper:string; marker:string }>;

/** Low-poly 3D kits (user decision: navy and claret, white shorts). UI accent colors above stay readable on dark panels. */
export const TEAM_KITS = {
  'team-1': { shirt: '#1d3766', trim: '#c9d4e6', shorts: '#f1f1ea', socks: '#1d3766', number: '#f4f4ee',
    keeper: { shirt: '#f1f2ed', trim: '#1d3766', shorts: '#f1f2ed', socks: '#f1f2ed', number: '#1d3766', gloves: '#2a2f36' } },
  'team-2': { shirt: '#76203a', trim: '#e6c6cf', shorts: '#f1f1ea', socks: '#76203a', number: '#f4f4ee',
    keeper: { shirt: '#1b1e24', trim: '#d8dce2', shorts: '#1b1e24', socks: '#1b1e24', number: '#e9ecef', gloves: '#e9ecef' } },
} as const satisfies Record<TeamId, { shirt:string; trim:string; shorts:string; socks:string; number:string; keeper:{ shirt:string; trim:string; shorts:string; socks:string; number:string; gloves:string } }>;
