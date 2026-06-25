import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveAssetUrl } from '@/lib/supabaseStorage';

const DEFAULT_PAYMENT_CONFIG = {
    onlinePaymentEnabled: true,
    gcash: {
        accountName: 'Barangay Tibanga',
        accountNumber: '0900 000 0000',
        qrImageUrl: '',
    },
    bank: {
        bankName: 'LandBank',
        accountName: 'Barangay Tibanga',
        accountNumber: '0000-0000-0000',
    },
};

// Public read-only endpoint for payment destination details.
export async function GET() {
    try {
        const { rows } = await query("SELECT value FROM settings WHERE key = 'paymentConfig'");
        const value = rows[0]?.value;
        if (!value || typeof value !== 'object') {
            return NextResponse.json({ paymentConfig: DEFAULT_PAYMENT_CONFIG });
        }
        const rawQr = String(value.gcash?.qrImageUrl || '').trim();
        const resolvedQr = rawQr ? await resolveAssetUrl(rawQr) : '';
        return NextResponse.json({
            paymentConfig: {
                onlinePaymentEnabled: value.onlinePaymentEnabled !== false,
                gcash: {
                    accountName: value.gcash?.accountName || DEFAULT_PAYMENT_CONFIG.gcash.accountName,
                    accountNumber: value.gcash?.accountNumber || DEFAULT_PAYMENT_CONFIG.gcash.accountNumber,
                    qrImageUrl: resolvedQr,
                },
                bank: {
                    bankName: value.bank?.bankName || DEFAULT_PAYMENT_CONFIG.bank.bankName,
                    accountName: value.bank?.accountName || DEFAULT_PAYMENT_CONFIG.bank.accountName,
                    accountNumber: value.bank?.accountNumber || DEFAULT_PAYMENT_CONFIG.bank.accountNumber,
                },
            },
        });
    } catch {
        return NextResponse.json({ paymentConfig: DEFAULT_PAYMENT_CONFIG });
    }
}
