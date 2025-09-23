import './globals.css';
export const metadata = {
  title: 'Post Call Analytics',
  description: 'Prompt-chained post call analysis with validation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="max-w-[800px] mx-auto p-6 font-sans">
        {children}
      </body>
    </html>
  );
}

