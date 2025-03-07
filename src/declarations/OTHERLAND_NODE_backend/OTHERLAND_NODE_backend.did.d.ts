import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Khet {
  'originalSize' : Size,
  'khetType' : KhetType,
  'gltfDataRef' : [Principal, string, bigint],
  'code' : [] | [string],
  'textures' : [] | [Array<[string, Uint8Array | number[]]>],
  'scale' : Scale,
  'animations' : [] | [Array<string>],
  'position' : Position,
  'khetId' : string,
}
export type KhetType = { 'Avatar' : null } |
  { 'Entity' : null } |
  { 'MobileObject' : null } |
  { 'SceneObject' : null } |
  { 'InteractiveObject' : null };
export type Position = [number, number, number];
export type Scale = [number, number, number];
export type Size = [number, number, number];
export interface _SERVICE {
  'abortKhetUpload' : ActorMethod<[string], undefined>,
  'clearAllKhets' : ActorMethod<[Principal], undefined>,
  'getKhet' : ActorMethod<[string], [] | [Khet]>,
  'getSceneObjectKhets' : ActorMethod<[], Array<Khet>>,
  'storeKhet' : ActorMethod<[Khet, Principal, string, bigint], [] | [string]>,
  'storeKhetChunk' : ActorMethod<
    [string, bigint, Uint8Array | number[]],
    undefined
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
