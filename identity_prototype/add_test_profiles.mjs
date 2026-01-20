#!/usr/bin/env node

/**
 * Add test profiles to identity_service
 * Usage: node add_test_profiles.mjs
 */

const BASE_URL = "http://localhost:5176/api";

const TEST_PROFILES = [
  { name: "Alice", age: 28, interests: "Photography, Travel, Cooking" },
  { name: "Bob", age: 35, interests: "Gaming, Programming, Music" },
  { name: "Charlie", age: 42, interests: "Reading, History, Hiking" },
];

const create_profile = async ({ name, age, interests }) => {
  const response = await fetch(`${BASE_URL}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, age, interests }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to create profile ${name}: ${error.error}`);
  }

  return await response.json();
};

const add_dummy_enrollment = async ({ profile_id }) => {
  // Generate a random 128-dimensional descriptor (dummy data for testing)
  const descriptor = Array.from({ length: 128 }, () => Math.random() * 2 - 1);

  const response = await fetch(`${BASE_URL}/profiles/${profile_id}/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descriptor, image_data_url: null }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Failed to enroll ${profile_id}: ${error.error}`);
  }

  return await response.json();
};

const main = async () => {
  console.log("Adding test profiles to identity_service...\n");

  for (const profile of TEST_PROFILES) {
    try {
      console.log(`Creating profile: ${profile.name}...`);
      const created = await create_profile(profile);
      const profile_id = created.profile.profile_id;
      console.log(`  ✓ Created with ID: ${profile_id}`);

      console.log(`  Adding dummy enrollment...`);
      await add_dummy_enrollment({ profile_id });
      console.log(`  ✓ Enrollment added\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}\n`);
    }
  }

  console.log("Done!");
  console.log("\nNOTE: These profiles have RANDOM face descriptors.");
  console.log("They won't match real faces. This is just for testing the UI.");
  console.log("\nTo add YOUR face, use the 'Create profile' button in the UI.");
};

main();
