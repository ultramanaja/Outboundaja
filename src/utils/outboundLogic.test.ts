import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE128_PATTERNS, encodeCode128B } from './barcode128';
import {
  BANGSAL_TAGS,
  DEFAULT_BANGSAL_TAG,
  addScannedItemsToStaging,
  buildOutboundCsv,
  calculateStagingTotals,
  filterOutboundRecords,
  finalizeStagingToOutbound,
  normalizeBangsalTag,
  parseMultiScanInput,
  updateBangsalItemInStaging,
  validateStagingInput,
  type StagingSession,
} from './outboundLogic';

test('Code 128 pattern table complies with ISO/IEC 15417 module widths', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
  for (let i = 0; i <= 105; i++) {
    const sum = CODE128_PATTERNS[i].split('').reduce((acc, n) => acc + Number(n), 0);
    assert.equal(sum, 11, `Symbol ${i} should total 11 modules`);
  }
  const stopSum = CODE128_PATTERNS[106].split('').reduce((acc, n) => acc + Number(n), 0);
  assert.equal(stopSum, 13, 'Stop symbol 106 should total 13 modules');
});

test('encodeCode128B produces deterministic bars and modulo-103 checksum', () => {
  const encoded = encodeCode128B('BGS-8801');
  assert.equal(encoded.value, 'BGS-8801');
  assert.ok(encoded.bars.length > 20);
  // 10 quiet + 11 start + (8 * 11 data) + 11 checksum + 13 stop + 10 quiet = 143 modules
  assert.equal(encoded.totalModules, 143);
});

test('Bangsal tag defaults to Reg and supports all required tags (Reg, HV, DOC, BP, CARGO)', () => {
  assert.deepEqual(BANGSAL_TAGS, ['Reg', 'HV', 'DOC', 'BP', 'CARGO']);
  assert.equal(DEFAULT_BANGSAL_TAG, 'Reg');
  assert.equal(normalizeBangsalTag(undefined), 'Reg');
  assert.equal(normalizeBangsalTag('INVALID'), 'Reg');
  for (const tag of BANGSAL_TAGS) {
    assert.equal(normalizeBangsalTag(tag), tag);
  }
});

test('parseMultiScanInput splits newlines, commas, and semicolons for multi-item scanning', () => {
  const parsed = parseMultiScanInput('bgs-001\nBGS-002, bgs-003 ; BGS-004\r\n');
  assert.deepEqual(parsed, ['BGS-001', 'BGS-002', 'BGS-003', 'BGS-004']);
});

test('validateStagingInput enforces non-empty unique manual staging names', () => {
  const existing: StagingSession[] = [
    {
      id: 'stg-1',
      name: 'STG-JKT-01',
      destination: 'Jakarta',
      isManual: false,
      createdAt: '2026-11-12T08:00:00Z',
      updatedAt: '2026-11-12T08:00:00Z',
      items: [],
    },
  ];

  assert.equal(validateStagingInput('   ', existing).valid, false);
  assert.equal(validateStagingInput('stg-jkt-01', existing).valid, false);
  const ok = validateStagingInput('  STG-SUB-09  ', existing);
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedName, 'STG-SUB-09');
});

test('addScannedItemsToStaging adds multiple bangsal items with default Reg tag and merges duplicates', () => {
  const baseStaging: StagingSession = {
    id: 'stg-2',
    name: 'STG-BDG-01',
    destination: 'Bandung Hub',
    isManual: true,
    createdAt: '2026-11-12T08:00:00Z',
    updatedAt: '2026-11-12T08:00:00Z',
    items: [],
  };

  const step1 = addScannedItemsToStaging(
    baseStaging,
    ['BGS-101', 'BGS-102'],
    2,
    DEFAULT_BANGSAL_TAG,
    '2026-11-12T08:05:00Z'
  );
  assert.equal(step1.addedCount, 2);
  assert.equal(step1.updatedStaging.items.length, 2);
  assert.equal(step1.updatedStaging.items[0].tag, 'Reg');
  assert.equal(step1.updatedStaging.items[0].qtyBagseal, 2);

  // Re-scanning BGS-101 increments qtyBagseal and updates tag if specified
  const step2 = addScannedItemsToStaging(
    step1.updatedStaging,
    ['BGS-101', 'BGS-103'],
    3,
    'HV',
    '2026-11-12T08:06:00Z'
  );
  assert.equal(step2.mergedCount, 1);
  assert.equal(step2.addedCount, 1);

  const bgs101 = step2.updatedStaging.items.find((i) => i.bangsalCode === 'BGS-101');
  assert.ok(bgs101);
  assert.equal(bgs101.qtyBagseal, 5);
  assert.equal(bgs101.tag, 'HV');

  // Inline tag change to CARGO
  const step3 = updateBangsalItemInStaging(step2.updatedStaging, bgs101.id, {
    tag: 'CARGO',
    qtyBagseal: 4,
  });
  const updated101 = step3.items.find((i) => i.bangsalCode === 'BGS-101');
  assert.equal(updated101?.tag, 'CARGO');
  assert.equal(updated101?.qtyBagseal, 4);

  const totals = calculateStagingTotals(step3.items);
  assert.equal(totals.totalBangsal, 3);
  assert.equal(totals.totalBagseal, 4 + 2 + 3);
});

test('finalizeStagingToOutbound moves items to outbound record with pending sync and clears staging', () => {
  const emptyStaging: StagingSession = {
    id: 'stg-empty',
    name: 'STG-EMPTY',
    destination: 'Medan',
    isManual: true,
    createdAt: '2026-11-12T08:00:00Z',
    updatedAt: '2026-11-12T08:00:00Z',
    items: [],
  };
  assert.throws(() => finalizeStagingToOutbound(emptyStaging));

  const populated = addScannedItemsToStaging(
    emptyStaging,
    ['BGS-9001', 'BGS-9002'],
    2,
    'DOC',
    '2026-11-12T08:10:00Z'
  ).updatedStaging;

  const { resetStaging, outboundRecord } = finalizeStagingToOutbound(
    populated,
    '2026-11-12T08:15:00Z'
  );

  assert.equal(resetStaging.items.length, 0);
  assert.equal(outboundRecord.totalBangsal, 2);
  assert.equal(outboundRecord.totalBagseal, 4);
  assert.equal(outboundRecord.syncStatus, 'pending');

  const csv = buildOutboundCsv([outboundRecord]);
  assert.ok(csv.includes('BGS-9001'));
  assert.ok(csv.includes('DOC'));
  assert.ok(csv.includes('Belum Sync'));

  const filtered = filterOutboundRecords([outboundRecord], '9001', 'DOC', 'pending');
  assert.equal(filtered.length, 1);
  assert.equal(filterOutboundRecords([outboundRecord], '9001', 'CARGO', 'pending').length, 0);
});
