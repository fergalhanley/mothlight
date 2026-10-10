import { createUser } from "./auth";
// Password via environment avoids putting it in shell history/process arguments.
const [email, name] = process.argv.slice(2);
if (!email || !name || !process.env.MOTHLIGHT_NEW_PASSWORD)
  throw new Error(
    'Usage: MOTHLIGHT_NEW_PASSWORD=... bun src/server/admin.ts email "Name"',
  );
const user = await createUser(email, name, process.env.MOTHLIGHT_NEW_PASSWORD);
console.log(
  `Created ${user.email}. They can sign in and be added to a profile by its owner.`,
);
