import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCartContext } from '../context/CartContext';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { itemCount } = useCartContext();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-background text-on-background">
      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/20">
        <div className="flex justify-between items-center h-16 px-6 md:px-12 max-w-480 mx-auto">
          <Link to="/" className="text-2xl font-bold tracking-tight text-slate-900 brand-font">
            CURATOR
          </Link>

          <div className="flex items-center gap-6">
            <span className="material-symbols-outlined text-slate-900 cursor-pointer hover:opacity-70 transition-opacity">
              public
            </span>

            <Link
              to="/cart"
              className="relative text-slate-900 hover:opacity-70 transition-opacity"
            >
              <span className="material-symbols-outlined">shopping_bag</span>

              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 grid place-items-center size-4 rounded-full bg-on-tertiary-container text-[10px] font-bold text-white">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </nav>

      {/* CONTENT */}
      <main className="grow pt-16">{children}</main>

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-50 border-t border-slate-200/20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 px-6 md:px-16 py-16 max-w-480 mx-auto">
          <div className="space-y-6">
            <div className="text-lg font-black text-slate-900 brand-font uppercase">
              The Digital Curator
            </div>
            <p className="text-xs text-slate-500 leading-relaxed uppercase tracking-wider">
              Defining the boundary between commerce and art since 2012.
            </p>
          </div>

          <div className="space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-widest text-slate-900">
              Customer Care
            </h5>
            <ul className="space-y-3">
              <li>
                <a className="text-xs uppercase text-slate-500 hover:text-slate-900">
                  Shipping & Returns
                </a>
              </li>
              <li>
                <a className="text-xs uppercase text-slate-500 hover:text-slate-900">
                  Sustainability
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-widest text-slate-900">Legal</h5>
            <ul className="space-y-3">
              <li>
                <a className="text-xs uppercase text-slate-500 hover:text-slate-900">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-widest text-slate-900">Connect</h5>
            <div className="flex gap-4">
              <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-primary">
                chat
              </span>
              <span className="material-symbols-outlined text-slate-500 cursor-pointer hover:text-primary">
                alternate_email
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-16 py-8 border-t border-slate-200/10 text-center">
          <p className="text-[10px] tracking-widest uppercase text-slate-400">
            © 2024 THE DIGITAL CURATOR. ALL RIGHTS RESERVED.
          </p>
        </div>
      </footer>
    </div>
  );
}
