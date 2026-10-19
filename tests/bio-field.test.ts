import { describe, expect, it } from 'vitest';
import { BIO_IDEAS, bioCount, bioFieldMarkup, profileMarkup } from '../src/ui/Profile';

const view = { name: 'Shashank', avatar: 1, hand: 'right' as const, order: [0, 1, 2, 3, 4], gate: false, fresh: false };

describe('the bio field', () => {
  it('counts to eighty, and from seventy says what is left', () => {
    expect(bioCount(0)).toBe('0/80');
    expect(bioCount(69)).toBe('69/80');
    expect(bioCount(76)).toBe('4 left');
    expect(bioCount(80)).toBe('0 left');
  });

  it('offers three lines to start from while it is empty, and none once it says something', () => {
    const empty = bioFieldMarkup('');
    for (const idea of BIO_IDEAS) expect(empty).toContain(idea);
    expect(empty).toContain('class="bio-ideas"');
    expect(bioFieldMarkup('Six or nothing.')).toContain('bio-ideas hidden');
  });

  it('is on the edit from My profile and never on the gate', () => {
    expect(profileMarkup({ ...view, bio: '' })).toContain('id="profile-bio"');
    expect(profileMarkup({ ...view, gate: true, bio: '' })).not.toContain('id="profile-bio"');
    expect(profileMarkup(view)).not.toContain('id="profile-bio"');
  });

  it('writes what was saved in as text', () => {
    expect(bioFieldMarkup('</textarea><img src=x>')).not.toContain('<img src=x>');
  });
});
