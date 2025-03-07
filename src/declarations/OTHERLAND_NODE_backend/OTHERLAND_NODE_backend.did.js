export const idlFactory = ({ IDL }) => {
  const Size = IDL.Tuple(IDL.Float64, IDL.Float64, IDL.Float64);
  const KhetType = IDL.Variant({
    'Avatar' : IDL.Null,
    'Entity' : IDL.Null,
    'MobileObject' : IDL.Null,
    'SceneObject' : IDL.Null,
    'InteractiveObject' : IDL.Null,
  });
  const Scale = IDL.Tuple(IDL.Float64, IDL.Float64, IDL.Float64);
  const Position = IDL.Tuple(IDL.Float64, IDL.Float64, IDL.Float64);
  const Khet = IDL.Record({
    'originalSize' : Size,
    'khetType' : KhetType,
    'gltfDataRef' : IDL.Tuple(IDL.Principal, IDL.Text, IDL.Nat),
    'code' : IDL.Opt(IDL.Text),
    'textures' : IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8)))),
    'scale' : Scale,
    'animations' : IDL.Opt(IDL.Vec(IDL.Text)),
    'position' : Position,
    'khetId' : IDL.Text,
  });
  return IDL.Service({
    'abortKhetUpload' : IDL.Func([IDL.Text], [], []),
    'clearAllKhets' : IDL.Func([IDL.Principal], [], []),
    'getKhet' : IDL.Func([IDL.Text], [IDL.Opt(Khet)], ['query']),
    'getSceneObjectKhets' : IDL.Func([], [IDL.Vec(Khet)], ['query']),
    'storeKhet' : IDL.Func(
        [Khet, IDL.Principal, IDL.Text, IDL.Nat],
        [IDL.Opt(IDL.Text)],
        [],
      ),
    'storeKhetChunk' : IDL.Func([IDL.Text, IDL.Nat, IDL.Vec(IDL.Nat8)], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
