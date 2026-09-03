import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
	email: {
		config: {
			provider: 'nodemailer',
			providerOptions: {
				host: env('SMTP_HOST'),
				port: env.int('SMTP_PORT', 587),
				auth: {
					user: env('SMTP_USERNAME'),
					pass: env('SMTP_PASSWORD'),
				},
				secure: env.bool('SMTP_SECURE', false),
			},
			settings: {
				defaultFrom: env('EMAIL_FROM'),
				defaultReplyTo: env('EMAIL_REPLY_TO', env('EMAIL_FROM')),
			},
		},
	},
});

export default config;
