import {BloomFilter, RotatingBloom} from '../protocol/bloom';

describe('BloomFilter', () => {
  it('reports presence for inserted keys', () => {
    const f = new BloomFilter();
    for (let i = 0; i < 200; i++) f.add(`p${i}`);
    for (let i = 0; i < 200; i++) expect(f.has(`p${i}`)).toBe(true);
  });

  it('false-positive rate stays low under nominal load', () => {
    const f = new BloomFilter();
    for (let i = 0; i < 5000; i++) f.add(`real-${i}`);
    let hits = 0;
    const probes = 5000;
    for (let i = 0; i < probes; i++) {
      if (f.has(`fake-${i}`)) hits++;
    }
    expect(hits / probes).toBeLessThan(0.01);
  });
});

describe('RotatingBloom', () => {
  it('still recognizes recent insertions after rotation', () => {
    const r = new RotatingBloom();
    r.add('alpha');
    expect(r.has('alpha')).toBe(true);
    for (let i = 0; i < 500; i++) r.add(`x${i}`);
    expect(r.has('alpha')).toBe(true); // before rotation
  });
});
