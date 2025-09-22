export const metadata = {
  title: 'Post Call Analytics',
  description: 'Prompt-chained post call analysis with validation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
        {children}
      </body>
    </html>
  );
}

