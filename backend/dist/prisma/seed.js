"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../config/prisma"));
async function seed() {
    console.log('🌱 Seeding ReachInbox scheduler database...');
    // 1. Create default admin user
    const admin = await prisma_1.default.user.upsert({
        where: { email: 'admin@reachinbox.ai' },
        update: {},
        create: {
            email: 'admin@reachinbox.ai',
            name: 'ReachInbox Admin',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        },
    });
    // 2. Create senders with configurable hourly limits
    const senders = [
        { email: 'growth@reachinbox.ai', name: 'Growth Team', hourlyLimit: 50 },
        { email: 'alex@reachinbox.ai', name: 'Alex Johnson (Outreach)', hourlyLimit: 30 },
        { email: 'sarah@reachinbox.ai', name: 'Sarah Connor (Partnerships)', hourlyLimit: 25 },
        { email: 'demo-sender@ethereal.email', name: 'Ethereal Test Sender', hourlyLimit: 10 },
    ];
    for (const s of senders) {
        await prisma_1.default.sender.upsert({
            where: { email: s.email },
            update: { hourlyLimit: s.hourlyLimit, name: s.name },
            create: s,
        });
    }
    console.log('✅ Database seeded successfully!');
}
seed()
    .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.default.$disconnect();
});
