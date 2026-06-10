const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.fromAddress = '';
    }

    async initTransporter() {
        const service = process.env.EMAIL_SERVICE || 'ethereal';

        if (service === 'ethereal') {
            console.log('[Email Service] Creating Ethereal test account for order alerts...');
            const testAccount = await nodemailer.createTestAccount();
            this.transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
            this.fromAddress = `"Uclose Alerts (Test)" <${testAccount.user}>`;
        } else {
            const isGmail = service.toLowerCase() === 'gmail';
            this.transporter = nodemailer.createTransport({
                service: isGmail ? 'gmail' : undefined,
                host: isGmail ? undefined : process.env.EMAIL_HOST,
                port: isGmail ? undefined : parseInt(process.env.EMAIL_PORT || '587', 10),
                secure: isGmail ? undefined : process.env.EMAIL_SECURE === 'true',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });
            this.fromAddress = process.env.EMAIL_FROM || `"Uclose Orders" <${process.env.EMAIL_USER}>`;
        }
    }

    async sendStatusUpdateEmail(to, orderId, newStatus, totalAmount, items) {
        if (!this.transporter) {
            await this.initTransporter();
        }

        const itemsList = Array.isArray(items) 
            ? items.map(item => `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 10px 0; font-weight: 700; color: #000;">${item.name} (${item.size || 'M'})</td>
                    <td style="padding: 10px 0; text-align: center; color: #4b5563;">x${item.quantity}</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #000;">$${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `).join('')
            : '';

        let statusDescription = `Hi there, the tracking status for your order has been updated to <strong>${newStatus}</strong>.`;
        if (newStatus === 'Return Requested') {
            statusDescription = `We have received your request to return items from order <strong>#${orderId}</strong>. Our team is currently reviewing your request and we will update you shortly.`;
        } else if (newStatus === 'Returned') {
            statusDescription = `Good news! Your return for order <strong>#${orderId}</strong> has been successfully processed. The returned items have been received at our warehouse.`;
        } else if (newStatus === 'Refunded') {
            statusDescription = `A refund has been successfully processed for your order <strong>#${orderId}</strong>. Please allow 3-5 business days for the funds to reflect in your original payment method.`;
        }

        const mailOptions = {
            from: this.fromAddress,
            to,
            subject: `Uclose Order Update: #${orderId} - ${newStatus}`,
            html: `
                <div style="font-family: 'Outfit', sans-serif, -apple-system; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="font-size: 24px; font-weight: 800; letter-spacing: -1px; text-transform: uppercase; color: #000;">Uclose.</span>
                        <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin-top: 4px;">Order Status Log</div>
                    </div>
                    
                    <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 20px 0; margin-bottom: 24px; text-align: center;">
                        <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin: 0 0 8px 0;">Order #${orderId}</p>
                        <h2 style="font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: -0.5px; color: #000; margin: 0;">Status: ${newStatus}</h2>
                    </div>

                    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                        ${statusDescription}
                    </p>

                    ${itemsList ? `
                        <h3 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px;">Order Summary</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
                            <thead>
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Item</th>
                                    <th style="text-align: center; padding-bottom: 8px; font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Qty</th>
                                    <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsList}
                                <tr>
                                    <td colspan="2" style="padding: 16px 0 0 0; font-weight: 700; text-transform: uppercase; font-size: 11px;">Total Amount Paid</td>
                                    <td style="padding: 16px 0 0 0; text-align: right; font-weight: 800; font-size: 18px; color: #000;">$${parseFloat(totalAmount).toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                    ` : ''}

                    <div style="background-color: #f9fafb; padding: 16px; border: 1px solid #e5e7eb; text-align: center; margin-top: 24px;">
                        <p style="margin: 0; font-size: 11px; color: #6b7280; font-weight: 500;">
                            Need help? You can track your packages, inspect details, and contact support on the portal dashboard.
                        </p>
                    </div>
                </div>
            `,
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            if (process.env.EMAIL_SERVICE === 'ethereal' || !process.env.EMAIL_SERVICE) {
                console.log('--------------------------------------------------');
                console.log(`[Email Service - Ethereal] Status Update Email sent to ${to}`);
                console.log(`[Email Service - Ethereal] Preview Link: ${nodemailer.getTestMessageUrl(info)}`);
                console.log('--------------------------------------------------');
            } else {
                console.log(`[Email Service] Status update email sent to ${to}`);
            }
            return info;
        } catch (error) {
            console.error(`[Email Service] Failed to send status email to ${to}:`, error.message);
            // Don't fail the request on email send failure, just log it.
        }
    }


    async sendTrackingUpdateEmail(to, orderId, courier, trackingNumber, estimatedDelivery) {
        if (!this.transporter) {
            await this.initTransporter();
        }

        let trackingUrl = 'http://localhost:5173/track';
        const cleanNumber = (trackingNumber || '').trim();
        const normCourier = (courier || '').toLowerCase().trim();

        if (cleanNumber) {
            if (normCourier.includes('dhl')) {
                trackingUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${cleanNumber}`;
            } else if (normCourier.includes('fedex')) {
                trackingUrl = `https://www.fedex.com/apps/fedextrack/?tracknumbers=${cleanNumber}`;
            } else if (normCourier.includes('ups')) {
                trackingUrl = `https://www.ups.com/track?loc=en_US&requester=ST&tracknum=${cleanNumber}`;
            } else if (normCourier.includes('delhivery')) {
                trackingUrl = `https://www.delhivery.com/track/package/${cleanNumber}`;
            }
        }

        const mailOptions = {
            from: this.fromAddress,
            to,
            subject: `Shipment Dispatch Alert: Uclose Order #${orderId}`,
            html: `
                <div style="font-family: 'Outfit', sans-serif, -apple-system; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="font-size: 24px; font-weight: 800; letter-spacing: -1px; text-transform: uppercase; color: #000;">Uclose.</span>
                        <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin-top: 4px;">Shipping Confirmation</div>
                    </div>
                    
                    <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 20px 0; margin-bottom: 24px; text-align: center;">
                        <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin: 0 0 8px 0;">Order #${orderId}</p>
                        <h2 style="font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: -0.5px; color: #000; margin: 0;">On Its Way</h2>
                    </div>

                    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                        Great news! A package from your order has been handed over to the courier service and is heading your way.
                    </p>

                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 2px; margin-bottom: 24px;">
                        <table style="width: 100%; font-size: 13px;">
                            <tr>
                                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Courier Partner:</td>
                                <td style="padding: 6px 0; font-weight: 700; color: #000; text-align: right;">${courier || 'Standard Delivery'}</td>
                            </tr>
                            ${trackingNumber ? `
                            <tr>
                                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Tracking ID:</td>
                                <td style="padding: 6px 0; font-weight: 700; color: #000; text-align: right; font-family: monospace;">${trackingNumber}</td>
                            </tr>
                            ` : ''}
                            ${estimatedDelivery ? `
                            <tr>
                                <td style="padding: 6px 0; color: #6b7280; font-weight: 500;">Est. Delivery:</td>
                                <td style="padding: 6px 0; font-weight: 700; color: #000; text-align: right;">${estimatedDelivery}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackingUrl}" style="background-color: #000; color: #fff; text-decoration: none; padding: 14px 28px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block; border-radius: 2px;">
                            Track Your Shipment
                        </a>
                    </div>

                    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 24px; line-height: 1.5;">
                        Please note tracking reports may take up to 24 hours to sync on the carrier's systems.
                    </p>
                </div>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            if (process.env.EMAIL_SERVICE === 'ethereal' || !process.env.EMAIL_SERVICE) {
                console.log('--------------------------------------------------');
                console.log(`[Email Service - Ethereal] Shipment Tracking Email sent to ${to}`);
                console.log(`[Email Service - Ethereal] Preview Link: ${nodemailer.getTestMessageUrl(info)}`);
                console.log('--------------------------------------------------');
            }
            return info;
        } catch (error) {
            console.error(`[Email Service] Failed to send tracking email to ${to}:`, error.message);
        }
    }

    async sendSupportReplyEmail(to, name, originalMessage, replyText) {
        if (!this.transporter) {
            await this.initTransporter();
        }

        const mailOptions = {
            from: this.fromAddress,
            to,
            subject: `Re: Uclose Support Request - Support Response`,
            html: `
                <div style="font-family: 'Outfit', sans-serif, -apple-system; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="font-size: 24px; font-weight: 800; letter-spacing: -1px; text-transform: uppercase; color: #000;">Uclose.</span>
                        <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin-top: 4px;">Customer Care</div>
                    </div>

                    <p style="color: #000; font-size: 15px; font-weight: 600; margin-bottom: 12px;">Hi ${name || 'there'},</p>
                    <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                        Our support team has reviewed your inquiry and posted a response:
                    </p>

                    <div style="border-left: 2px solid #000; padding-left: 16px; margin: 24px 0; font-size: 14px; color: #000; font-style: italic; line-height: 1.6;">
                        ${replyText.replace(/\n/g, '<br/>')}
                    </div>

                    <div style="background-color: #f9fafb; padding: 16px; border: 1px solid #e5e7eb; font-size: 12px; margin-top: 32px;">
                        <span style="font-weight: 700; color: #6b7280; text-transform: uppercase; display: block; margin-bottom: 6px; font-size: 9px; letter-spacing: 1px;">Original Inquiry:</span>
                        <p style="color: #9ca3af; margin: 0; font-style: italic;">"${originalMessage}"</p>
                    </div>

                    <div style="text-align: center; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
                        <p style="margin: 0; font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
                            Thank you for shopping with Uclose.
                        </p>
                    </div>
                </div>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            if (process.env.EMAIL_SERVICE === 'ethereal' || !process.env.EMAIL_SERVICE) {
                console.log('--------------------------------------------------');
                console.log(`[Email Service - Ethereal] Support Reply Email sent to ${to}`);
                console.log(`[Email Service - Ethereal] Preview Link: ${nodemailer.getTestMessageUrl(info)}`);
                console.log('--------------------------------------------------');
            }
            return info;
        } catch (error) {
            console.error(`[Email Service] Failed to send support reply email to ${to}:`, error.message);
        }
    }
}

module.exports = new EmailService();
