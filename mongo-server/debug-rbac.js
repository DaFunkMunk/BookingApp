/* eslint-disable @typescript-eslint/no-var-requires */
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookingapp';

const Role = mongoose.model(
  'Role',
  new Schema({ name: String }, { collection: 'roles' })
);
const UserRole = mongoose.model(
  'UserRole',
  new Schema(
    { userId: Schema.Types.ObjectId, roleId: Schema.Types.ObjectId },
    { collection: 'userRoles' }
  )
);
const RoleCapability = mongoose.model(
  'RoleCapability',
  new Schema(
    { roleId: Schema.Types.ObjectId, capabilityId: Schema.Types.ObjectId },
    { collection: 'roleCapabilities' }
  )
);
const Capability = mongoose.model(
  'Capability',
  new Schema({ key: String }, { collection: 'capabilities' })
);

async function run() {
  await mongoose.connect(uri);
  const userId = new Types.ObjectId('68e834c5fb0ce8ff837e65be'); // ngpend2@gmail.com

  const userRoles = await UserRole.find({ userId }).lean();
  console.log('userRoles:', userRoles);
  const roleIds = userRoles.map((doc) => doc.roleId);
  const roles = await Role.find({ _id: { $in: roleIds } }).lean();
  console.log('roles:', roles);

  const roleCapabilityDocs = await RoleCapability.find({ roleId: { $in: roleIds } }).lean();
  console.log('roleCapabilities:', roleCapabilityDocs);
  const capabilityIds = roleCapabilityDocs.map((doc) => doc.capabilityId);
  const capabilities = await Capability.find({ _id: { $in: capabilityIds } }).lean();
  console.log('capabilities:', capabilities.map((doc) => doc.key));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
