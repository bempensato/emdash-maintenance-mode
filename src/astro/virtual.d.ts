declare module "virtual:emdash-maintenance-mode/config" {
	export const options: {
		/** Public path of the maintenance page. */
		path: string;
		/** Path of the password endpoint. */
		accessPath: string;
	};
	/** `options.layout`, or the built-in `DefaultLayout.astro`. */
	const Layout: (props: Record<string, unknown>) => unknown;
	export { Layout };
}
