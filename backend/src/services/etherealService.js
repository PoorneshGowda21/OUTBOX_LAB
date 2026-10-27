import nodemailer from 'nodemailer';

class EtherealService {
  constructor() {
    this.transporter = null;
    this.testAccount = null;
    this.isInitializing = null;
  }

  async initialize() {
    if (this.transporter) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      try {
        console.log('🔄 Initializing Ethereal SMTP fake account...');
        this.testAccount = await nodemailer.createTestAccount();
        console.log('✅ Ethereal test account created:');
        console.log(`   User: ${this.testAccount.user}`);
        console.log(`   Pass: ${this.testAccount.pass}`);

        this.transporter = nodemailer.createTransport({
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
      } catch (err) {
        console.error('❌ Failed to initialize Ethereal SMTP:', err.message);
        throw err;
      } finally {
        this.isInitializing = null;
      }
    })();

    return this.isInitializing;
  }

  async sendEmail({ from, to, subject, text, html, messageId }) {
    if (!this.transporter) {
      await this.initialize();
    }

    if (!this.transporter) {
      throw new Error('Ethereal SMTP transporter is not initialized');
    }

    const mailOptions = {
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
    };

    if (messageId) {
      mailOptions.messageId = messageId;
    }

    const info = await this.transporter.sendMail(mailOptions);

    const previewUrl = nodemailer.getTestMessageUrl(info);
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

export const etherealService = new EtherealService();
export default etherealService;
