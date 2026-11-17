import type { MealItem, Profile } from '@sage/shared';

export const DEVICE_A = '7b0e5c7e-9d55-4b0a-8f0e-2d6c1e0a9f11';
export const DEVICE_B = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';

export const ashaProfile: Profile = {
  name: 'Asha',
  sex: 'female',
  age: 34,
  weightKg: 82,
  heightCm: 165,
  goalWeightKg: 76,
  activity: 'sedentary',
};

export const roti: MealItem = {
  name: 'Roti',
  portion: '2 rotis',
  kcal: 210,
  proteinG: 6.2,
  confidence: 'high',
};

export const dal: MealItem = {
  name: 'Dal tadka',
  portion: '1 katori',
  kcal: 180,
  proteinG: 9.1,
  confidence: 'medium',
};

export const chai: MealItem = {
  name: 'Masala chai',
  portion: '1 cup',
  kcal: 90,
  proteinG: 2.5,
  confidence: 'medium',
};

/** A tiny valid base64 payload standing in for a photo. */
export const TINY_IMAGE_BASE64 = Buffer.from('not really a jpeg').toString('base64');

/** Asha's profile with the optional `sex` field left out. */
export function profileWithoutSex(): Profile {
  const profile: Profile = { ...ashaProfile };
  delete profile.sex;
  return profile;
}
