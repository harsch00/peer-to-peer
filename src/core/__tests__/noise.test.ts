/**
 * Integration test: Noise_XX_25519_AESGCM_SHA256 round-trip.
 */
import {x25519} from '@noble/curves/ed25519';
import {randomBytes} from '@noble/hashes/utils';
import {runHandshake} from '../crypto/noise';

describe('Noise XX handshake', () => {
  it('completes mutual auth and produces matching cipher states', () => {
    const aSk = randomBytes(32);
    const bSk = randomBytes(32);
    const aPk = x25519.getPublicKey(aSk);
    const bPk = x25519.getPublicKey(bSk);

    const {initiator, responder} = runHandshake(
      {staticPriv: aSk, staticPub: aPk},
      {staticPriv: bSk, staticPub: bPk},
    );

    // Each side learned the other's static key.
    expect(Buffer.from(initiator.remoteStatic).toString('hex')).toEqual(
      Buffer.from(bPk).toString('hex'),
    );
    expect(Buffer.from(responder.remoteStatic).toString('hex')).toEqual(
      Buffer.from(aPk).toString('hex'),
    );

    // Application data round-trip.
    const ad = new TextEncoder().encode('p2p-mesh');
    const m1 = new TextEncoder().encode('hello mesh');
    const ct = initiator.send.encryptWithAd(ad, m1);
    const pt = responder.recv.decryptWithAd(ad, ct);
    expect(new TextDecoder().decode(pt)).toEqual('hello mesh');

    // Reverse direction.
    const m2 = new TextEncoder().encode('howdy back');
    const ct2 = responder.send.encryptWithAd(ad, m2);
    const pt2 = initiator.recv.decryptWithAd(ad, ct2);
    expect(new TextDecoder().decode(pt2)).toEqual('howdy back');
  });
});
