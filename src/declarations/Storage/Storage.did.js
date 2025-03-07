export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    'clearBlobs' : IDL.Func([], [], []),
    'deleteBlob' : IDL.Func([IDL.Text], [], []),
    'finalizeBlob' : IDL.Func(
        [IDL.Text, IDL.Nat, IDL.Nat],
        [IDL.Opt(IDL.Text)],
        [],
      ),
    'getBlobChunk' : IDL.Func(
        [IDL.Text, IDL.Nat],
        [IDL.Opt(IDL.Vec(IDL.Nat8))],
        ['query'],
      ),
    'getBlobSize' : IDL.Func([IDL.Text], [IDL.Opt(IDL.Nat)], ['query']),
    'storeBlobChunk' : IDL.Func([IDL.Text, IDL.Nat, IDL.Vec(IDL.Nat8)], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
