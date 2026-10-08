import { afterEach, describe, expect, it, vi } from 'vitest';
import { osrmRouting, photonGeocoder, plzGeocoder, safeRoute, straightLineLeg, straightLineRouting } from './routing';
import { haversine, pointAlong, polylineLength, projectOnPolyline, zoneForZip } from './geo';
import { buildSettings } from './seed/settings';

const store = { lat: 48.2525161, lng: 11.6534043 };
const anna = { lat: 48.2484249, lng: 11.6538629 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Geo', () => {
  it('Haversine, Linienzug, Interpolation, Projektion', () => {
    const d = haversine(store, anna);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(470);
    const line: [number, number][] = [
      [48.25, 11.65],
      [48.25, 11.66],
      [48.26, 11.66],
    ];
    const len = polylineLength(line);
    const mid = pointAlong(line, len / 4);
    expect(mid.point[0]).toBeCloseTo(48.25, 5);
    expect(mid.heading).toBeCloseTo(90, 0);
    const proj = projectOnPolyline(line, [48.2505, 11.66]);
    expect(proj.offset).toBeLessThan(5);
    // ~741 m auf dem ersten Segment + ~56 m auf dem zweiten
    expect(proj.along).toBeGreaterThan(780);
    expect(proj.along).toBeLessThan(810);
  });

  it('Liefergebiet per PLZ', () => {
    const s = buildSettings();
    expect(zoneForZip(s, '85748')?.id).toBe('z-garching');
    expect(zoneForZip(s, '85737')?.id).toBe('z-nachbarorte');
    expect(zoneForZip(s, '80809')?.id).toBe('z-muenchen-nord');
    expect(zoneForZip(s, '80331')).toBeUndefined();
  });
});

describe('Routing', () => {
  it('Luftlinien-Fallback: Distanz × 1,3 bei 30 km/h mit Zwischenpunkten', () => {
    const leg = straightLineLeg(store, anna);
    expect(leg.distance).toBe(Math.round(haversine(store, anna) * 1.3));
    expect(leg.duration).toBe(Math.round(leg.distance / (30 / 3.6)));
    expect(leg.coords.length).toBeGreaterThan(3);
  });

  it('OSRM: Geometrie je Abschnitt aus einer Anfrage', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1500,
            duration: 200,
            legs: [
              { distance: 700, duration: 90, steps: [{ geometry: { coordinates: [[11.6534, 48.2525], [11.6536, 48.2500]] } }, { geometry: { coordinates: [[11.6536, 48.25], [11.6538, 48.2484]] } }] },
              { distance: 800, duration: 110, steps: [{ geometry: { coordinates: [[11.6538, 48.2484], [11.6534, 48.2525]] } }] },
            ],
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const routing = osrmRouting();
    const legs = await routing.route([store, anna, store]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('router.project-osrm.org/route/v1/driving/11.653404,48.252516;11.653863,48.248425;11.653404,48.252516');
    expect(url).toContain('overview=full&geometries=geojson');
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ distance: 700, duration: 90 });
    expect(legs[0].coords).toEqual([
      [48.2525, 11.6534],
      [48.25, 11.6536],
      [48.2484, 11.6538],
    ]);
    // gleiche Abschnitte erneut → aus dem Cache, keine weitere Anfrage
    const again = await routing.route([store, anna]);
    expect(again[0]).toEqual(legs[0]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('OSRM nicht erreichbar → Luftlinie, Operation scheitert nie', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const routing = osrmRouting();
    const legs = await routing.route([store, anna, store]);
    expect(legs).toHaveLength(2);
    expect(legs[0].distance).toBe(straightLineLeg(store, anna).distance);
    const broken = { route: async () => [] };
    expect(await safeRoute(broken, [store, anna])).toHaveLength(1);
    expect(await safeRoute(straightLineRouting(), [store])).toEqual([]);
  });
});

describe('Geocoding', () => {
  it('PLZ-Fallback erkennt PLZ und Ort', async () => {
    const g = plzGeocoder();
    const [hit] = await g.search('Bahnhofstraße 10, 85386 Eching');
    expect(hit).toMatchObject({ street: 'Bahnhofstraße 10', zip: '85386', city: 'Eching' });
    expect(hit.lat).toBeCloseTo(48.3, 1);
    expect(await g.search('Marienplatz 1, 80331 München')).toEqual([]);
    expect(await g.geocode({ street: 'x', zip: '85748', city: 'Garching' })).toMatchObject({ lat: expect.any(Number) });
  });

  it('Photon: Ergebnisse im Umkreis, Fallback bei Fehler', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          { geometry: { coordinates: [11.6538629, 48.2484249] }, properties: { street: 'Mühlgasse', housenumber: '6', postcode: '85748', city: 'Garching bei München' } },
          { geometry: { coordinates: [13.4, 52.5] }, properties: { street: 'Mühlgasse', housenumber: '6', postcode: '10115', city: 'Berlin' } },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await photonGeocoder().search('Mühlgasse 6');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('photon.komoot.io/api/?q=M%C3%BChlgasse%206&lang=de&limit=6&lat=48.2525&lon=11.6534');
    expect(results).toEqual([
      { label: 'Adresse', name: '', street: 'Mühlgasse 6', zip: '85748', city: 'Garching b. München', lat: 48.2484249, lng: 11.6538629 },
    ]);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const fallback = await photonGeocoder().search('Keltenweg 12, 85748 Garching');
    expect(fallback[0]).toMatchObject({ zip: '85748', street: 'Keltenweg 12' });
  });
});
