import {createPacket, decodePacket, encodePacket, PacketType, relayPacket} from '../protocol/packet';

const senderId = '1122334455667788';
const recipientId = '99aabbccddeeff00';

describe('packet codec', () => {
  it('round-trips through encode/decode', () => {
    const p = createPacket({
      type: PacketType.ENCRYPTED_MSG,
      senderId,
      recipientId,
      payload: new TextEncoder().encode('hello, world'),
      ttl: 5,
    });
    const buf = encodePacket(p);
    const back = decodePacket(buf);
    expect(back.senderId).toBe(p.senderId);
    expect(back.recipientId).toBe(p.recipientId);
    expect(back.ttl).toBe(5);
    expect(new TextDecoder().decode(back.payload)).toBe('hello, world');
    expect(back.path).toEqual([senderId]);
  });

  it('relays decrement TTL and append path', () => {
    const p = createPacket({
      type: PacketType.ENCRYPTED_MSG,
      senderId,
      recipientId,
      payload: new Uint8Array([0]),
      ttl: 4,
    });
    const r = relayPacket(p, '0011002200330044');
    expect(r.ttl).toBe(3);
    expect(r.path[r.path.length - 1]).toBe('0011002200330044');
  });
});
