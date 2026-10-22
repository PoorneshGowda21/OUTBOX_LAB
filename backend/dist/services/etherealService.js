"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.etherealService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class EtherealService {
    transporter = null;
    testAccount = null;
    isInitializing = null;
    async initialize() {
        if (this.transporter)
            return;
        if (this.isInitializing)
            return this.isInitializing;
        this.isInitializing = (async () => {
            try {
                console.log('🔄 Initializing Ethereal SMTP fake account...');
                this.testAccount = await nodemailer_1.default.createTestAccount();
                console.log('✅ Ethereal test account created:');
                console.log(`   User: ${this.testAccount.user}`);
                console.log(`   Pass: ${this.testAccount.pass}`);
                this.transporter = nodemailer_1.default.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: this.testAccount.user,
                        pass: this.testAccount.pass,
                    },
                });
                // Verify connection
                await this.transporter.verify();
                console.log('✅ Ethereal SMTP transport verified and ready!');
            }
            catch (err) {
                console.error('❌ Failed to initialize Ethereal SMTP:', err.message);
                throw err;
            }
            finally {
                this.isInitializing = null;
            }
        })();
        return this.isInitializing;
    }
    async sendEmail({ from, to, subject, text, html }) {
        if (!this.transporter) {
            await this.initialize();
        }
        if (!this.transporter) {
            throw new Error('Ethereal SMTP transporter is not initialized');
        }
        const info = await this.transporter.sendMail({
            from,
            to,
            subject,
            text: text || subject,
            html: html || `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2>${subject}</h2>
        <p>${text || subject}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <small style="color: #64748b;">Sent via ReachInbox Email Scheduler Demo</small>
      </div>`,
        });
        const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
        console.log(`📧 Email sent to ${to}. MessageId: ${info.messageId}`);
        if (previewUrl) {
            console.log(`🔗 Ethereal Preview URL: ${previewUrl}`);
        }
        return {
            messageId: info.messageId,
            previewUrl,
        };
    }
    getTestAccount() {
        return this.testAccount;
    }
}
exports.etherealService = new EtherealService();
exports.default = exports.etherealService;
