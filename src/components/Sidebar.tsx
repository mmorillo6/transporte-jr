'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import type { SessionPayload } from '@/lib/session'

const navItems = [
  { href: '/mi-cuenta',      label: 'Mi cuenta',      icon: '◯', roles: ['CHOFER', 'MECANICO'] },
  { href: '/dashboard',      label: 'Dashboard',      icon: '◈', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/romana',         label: 'Romana',          icon: '⊕', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/viajes',         label: 'Viajes',          icon: '⟳', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/camiones',       label: 'Flota',            icon: '◧', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/nomina',         label: 'Nómina',          icon: '◑', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/mantenimiento',  label: 'Mantenimiento',   icon: '⚙', roles: ['DUENO', 'ENCARGADO', 'MECANICO'] },
  { href: '/despacho',       label: 'Despacho',        icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/caja',           label: 'Finanzas',        icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/relaciones',     label: 'Relaciones',      icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/reportes',       label: 'Reportes',        icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/rutas',          label: 'Minas & Rutas',   icon: '◉', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/usuarios',       label: 'Usuarios',        icon: '◫', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/perfil',         label: 'Mi perfil',       icon: '◯', roles: ['DUENO', 'ENCARGADO', 'AFILIADO', 'MECANICO', 'CHOFER'] },
]

export default function Sidebar({
  session,
  collapsed = false,
  onToggle,
}: {
  session: SessionPayload
  collapsed?: boolean
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const visible = navItems.filter(item => item.roles.includes(session.role))

  return (
    <aside className={`hidden lg:flex flex-col fixed inset-y-0 left-0 bg-zinc-900 border-r border-zinc-800 z-40 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>

      {/* Logo / Toggle */}
      <div className={`flex items-center border-b border-zinc-800 h-16 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}>
        {collapsed ? (
          <button onClick={onToggle} title="Expandir menú"
            className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center hover:bg-amber-400 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUgAAAEaCAYAAABzUs7PAAAMTGlDQ1BJQ0MgUHJvZmlsZQAASImVVwdYU1cbPndkQggQiICMsJcgIiOAjBBWANlbVEISIIwYE4KKGymtYN0ighOtgihYrYAUF2pdFMW9iwMVpRZrcSv/CQG09B/P/z3Pufe97/nOe77vu+eOAwC9iy+V5qKaAORJ8mUxwf6spOQUFukZQAEOEGACTPkCuZQTFRUOoA2f/26vr0FPaJcdlFr/7P+vpiUUyQUAIFEQpwvlgjyIfwIAbxVIZfkAEKWQN5+VL1XitRDryGCAENcocaYKtypxugpfHPSJi+FC/AgAsjqfL8sEQKMP8qwCQSbUocNsgZNEKJZA7AexT17eDCHEiyC2gT5wTrpSn53+lU7m3zTTRzT5/MwRrMpl0MgBYrk0lz/n/yzH/7a8XMXwHNawqWfJQmKUOcO6PcqZEabE6hC/laRHREKsDQCKi4WD/krMzFKExKv8URuBnAtrBpgQT5LnxvKG+BghPyAMYkOIMyS5EeFDPkUZ4iClD6wfWiHO58VBrAdxjUgeGDvkc0w2I2Z43msZMi5niH/Klw3GoNT/rMiJ56j0Me0sEW9IH3MszIpLhJgKcUCBOCECYg2II+Q5sWFDPqmFWdyIYR+ZIkaZiwXEMpEk2F+lj5VnyIJihvx358mHc8eOZYl5EUP4Un5WXIiqVtgjAX8wfpgL1ieScOKHdUTypPDhXISigEBV7jhZJImPVfG4njTfP0Y1FreT5kYN+eP+otxgJW8GcZy8IHZ4bEE+XJwqfbxEmh8Vp4oTr8zmh0ap4sH3gXDABQGABRSwpYMZIBuIO3qbeuGVqicI8IEMZAIRcBhihkckDvZI4DEWFILfIRIB+cg4/8FeESiA/KdRrJITj3CqowPIGOpTquSAxxDngTCQC68Vg0qSkQgSwCPIiP8RER82AcwhFzZl/7/nh9kvDAcy4UOMYnhGFn3YkxhIDCCGEIOItrgB7oN74eHw6AebM87GPYbz+OJPeEzoJDwgXCV0EW5OFxfJRkU5GXRB/aCh+qR/XR/cCmq64v64N1SHyjgTNwAOuAuch4P7wpldIcsdiltZFdYo7b9l8NUdGvKjOFFQyhiKH8Vm9EgNOw3XERVlrb+ujyrW9JF6c0d6Rs/P/ar6QngOG+2JfYcdwE5jx7GzWCvWBFjYUawZa8cOK/HIins0uOKGZ4sZjCcH6oxeM1/urLKScqc6px6nj6q+fNHsfOXDyJ0hnSMTZ2blszjwiyFi8SQCx3EsZydnNwCU3x/V6+1V9OB3BWG2f+GW/AaA99GBgYGfv3ChRwH40R2+Eg594WzY8NOiBsCZQwKFrEDF4coDAb456PDp0wfGwBzYwHycgRvwAn4gEISCSBAHksE0GH0WXOcyMAvMA4tBCSgDK8E6UAm2gO2gBuwF+0ETaAXHwS/gPLgIroLbcPV0g+egD7wGHxAEISE0hIHoIyaIJWKPOCNsxAcJRMKRGCQZSUMyEQmiQOYhS5AyZDVSiWxDapEfkUPIceQs0oncRO4jPcifyHsUQ9VRHdQItULHo2yUg4ahcehUNBOdiRaixehytAKtRvegjehx9Dx6Fe1Cn6P9GMDUMCZmijlgbIyLRWIpWAYmwxZgpVg5Vo3VYy3wPl/GurBe7B1OxBk4C3eAKzgEj8cF+Ex8Ab4Mr8Rr8Eb8JH4Zv4/34Z8JNIIhwZ7gSeARkgiZhFmEEkI5YSfhIOEUfJa6Ca+JRCKTaE10h89iMjGbOJe4jLiJ2EA8RuwkPiT2k0gkfZI9yZsUSeKT8kklpA2kPaSjpEukbtJbshrZhOxMDiKnkCXkInI5eTf5CPkS+Qn5A0WTYknxpERShJQ5lBWUHZQWygVKN+UDVYtqTfWmxlGzqYupFdR66inqHeorNTU1MzUPtWg1sdoitQq1fWpn1O6rvVPXVrdT56qnqivUl6vvUj+mflP9FY1Gs6L50VJo+bTltFraCdo92lsNhoajBk9DqLFQo0qjUeOSxgs6hW5J59Cn0Qvp5fQD9Av0Xk2KppUmV5OvuUCzSvOQ5nXNfi2G1gStSK08rWVau7XOaj3VJmlbaQdqC7WLtbdrn9B+yMAY5gwuQ8BYwtjBOMXo1iHqWOvwdLJ1ynT26nTo9Olq67roJujO1q3SPazbxcSYVkweM5e5grmfeY35fozRGM4Y0ZilY+rHXBrzRm+snp+eSK9Ur0Hvqt57fZZ+oH6O/ir9Jv27BriBnUG0wSyDzQanDHrH6oz1GisYWzp2/9hbhqihnWGM4VzD7Ybthv1GxkbBRlKjDUYnjHqNmcZ+xtnGa42PGPeYMEx8TMQma02Omjxj6bI4rFxWBeskq8/U0DTEVGG6zbTD9IOZtVm8WZFZg9ldc6o52zzDfK15m3mfhYnFZIt5FnUWtywplmzLLMv1lqct31hZWyVafWvVZPXUWs+aZ11oXWd9x4Zm42sz06ba5oot0ZZtm2O7yfaiHWrnapdlV2V3wR61d7MX22+y7xxHGOcxTjKuetx1B3UHjkOBQ53DfUemY7hjkWOT44vxFuNTxq8af3r8ZydXp1ynHU63J2hPCJ1QNKFlwp/Ods4C5yrnKxNpE4MmLpzYPPGli72LyGWzyw1Xhutk129d21w/ubm7ydzq3XrcLdzT3De6X2frsKPYy9hnPAge/h4LPVo93nm6eeZ77vf8w8vBK8drt9fTSdaTRJN2THrobebN997m3eXD8knz2erT5Wvqy/et9n3gZ+4n9Nvp94Rjy8nm7OG88Hfyl/kf9H/D9eTO5x4LwAKCA0oDOgK1A+MDKwPvBZkFZQbVBfUFuwbPDT4WQggJC1kVcp1nxBPwanl9oe6h80NPhqmHxYZVhj0ItwuXhbdMRieHTl4z+U6EZYQkoikSRPIi10TejbKOmhn1czQxOiq6KvpxzISYeTGnYxmx02N3x76O849bEXc73iZeEd+WQE9ITahNeJMYkLg6sStpfNL8pPPJBsni5OYUUkpCys6U/imBU9ZN6U51TS1JvTbVeursqWenGUzLnXZ4On06f/qBNEJaYtrutI/8SH41vz+dl74xvU/AFawXPBf6CdcKe0TeotWiJxneGasznmZ6Z67J7MnyzSrP6hVzxZXil9kh2Vuy3+RE5uzKGchNzG3II+el5R2SaEtyJCdnGM+YPaNTai8tkXbN9Jy5bmafLEy2U47Ip8qb83Xgj367wkbxjeJ+gU9BVcHbWQmzDszWmi2Z3T7Hbs7SOU8Kgwp/mIvPFcxtm2c6b/G8+/M587ctQBakL2hbaL6weGH3ouBFNYupi3MW/1rkVLS66K8liUtaio2KFxU//Cb4m7oSjRJZyfVvvb7d8h3+nfi7jqUTl25Y+rlUWHquzKmsvOzjMsGyc99P+L7i+4HlGcs7Vrit2LySuFKy8toq31U1q7VWF65+uGbymsa1rLWla/9aN33d2XKX8i3rqesV67sqwiuaN1hsWLnhY2VW5dUq/6qGjYYbl258s0m46dJmv831W4y2lG15v1W89ca24G2N1VbV5duJ2wu2P96RsOP0D+wfanca7Czb+WmXZFdXTUzNyVr32trdhrtX1KF1irqePal7Lu4N2Ntc71C/rYHZULYP7FPse/Zj2o/X9oftbzvAPlD/k+VPGw8yDpY2Io1zGvuaspq6mpObOw+FHmpr8Wo5+LPjz7taTVurDuseXnGEeqT4yMDRwqP9x6THeo9nHn/YNr3t9omkE1dORp/sOBV26swvQb+cOM05ffSM95nWs55nD51jn2s673a+sd21/eCvrr8e7HDraLzgfqH5osfFls5JnUcu+V46fjng8i9XeFfOX4242nkt/tqN66nXu24Ibzy9mXvz5a2CWx9uL7pDuFN6V/Nu+T3De9W/2f7W0OXWdfh+wP32B7EPbj8UPHz+SP7oY3fxY9rj8icmT2qfOj9t7QnqufhsyrPu59LnH3pLftf6feMLmxc//eH3R3tfUl/3S9nLgT+XvdJ/tesvl7/a+qP6773Oe/3hTelb/bc179jvTr9PfP/kw6yPpI8Vn2w/tXwO+3xnIG9gQMqX8Qd/BTCg3NpkAPDnLgBoyQAw4L6ROkW1Pxw0RLWnHUTgP2HVHnLQ4J9LPfynj+6FfzfXAdi3AwArqE9PBSCKBkCcB0AnThxpw3u5wX2n0ohwb7A15lN6Xjr4N6bak34V9+gzUKq6gNHnfwEi0YL/FDVe6gAAAARjSUNQDA0AAW4D4+8AAACKZVhJZk1NACoAAAAIAAQBGgAFAAAAAQAAAD4BGwAFAAAAAQAAAEYBKAADAAAAAQACAACHaQAEAAAAAQAAAE4AAAAAAAAAkAAAAAEAAACQAAAAAQADkoYABwAAABIAAAB4oAIABAAAAAEAAAFIoAMABAAAAAEAAAEaAAAAAEFTQ0lJAAAAU2NyZWVuc2hvdAu7yesAAAAJcEhZcwAAFiUAABYlAUlSJPAAAAHWaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6UGl4ZWxZRGltZW5zaW9uPjI4MjwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj4zMjg8L2V4aWY6UGl4ZWxYRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpVc2VyQ29tbWVudD5TY3JlZW5zaG90PC9leGlmOlVzZXJDb21tZW50PgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4Kd5HtaAAAABxpRE9UAAAAAgAAAAAAAACNAAAAKAAAAI0AAACNAAANst2S4DkAAA1+SURBVHgB7J17jBXVHYB/sLC77MKyPNYuL3msAgWWSkBURGJSQrVNC9rSWprU2FbB0tgolWoJiQlBLRZ8pFTQtsYmJba0Cq1WS2hiKyriEiyvArosyFOWx/LYJ+7SOwsD93X23jszd+6cM9/9Z++cOc/v/Oa7Z+7M3O1UVFRyQXhBAAIQgEACgU4IMoEJCRCAAATaCSBIAgECEICAggCCVIAhGQIQgACCJAYgAAEIKAggSAUYkiEAAQggSGIAAhCAgIIAglSAIRkCEIAAgiQGIAABCCgIIEgFGJIhAAEIIEhiAAIQgICCAIJUgCEZAhCAAIIkBiAAAQgoCCBIBRiSIQABCCBIYgACEICAggCCVIAhGQIQgACCJAYgAAEIKAggSAUYkiEAAQggSGIAAhCAgIIAglSAIRkCEIAAgiQGIAABCCgIIEgFGJIhAAEIIEhiAAIQgICCAIJUgCEZAhCAAIIkBiAAAQgoCCBIBRiSIQABCCBIYgACEICAggCCVIAhGQIQgACCJAYgAAEIKAggSAWYVMkjBxTKyIGFUlFeIIP75ku/3vlSVtJFehbnSXFBZ+ma1ylVFewPIYHzrRekvrlNTte3Su2Zz+XIyRbZf7xFqo82y66DTbLrUFMIqQR3yAgyzbmpHNxNJn+xu9w4vFjGVxS3SzDNomSDQNoEGiLyrKqul4176mXD/87Jtv2NaZclo/cEEGQHTC0pfm18T7ltXE8ZXJbfQU52QSA7BPbXtshbW07LG5tPI8vsIO6wVgSZBM/MSb3k2zf3lgkVRUn2kgSB3BCoqm6QP797Ula/dyo3HQhhqwgyatJ/NLWv3PPlvtK/V9eoVN5CIFgEDp86Ly/967j8dv3xYHXMwN4gyMikzrqlt8z96lWI0cAAN3lIliiX/+OYrHrnpMnDzOnYQi3IG64tlp/NKOdUOqchSONuCVin3r9ac1Q++LjebVWUjyMQWkE+cme5zJ5WFoeDTQjoS2Dlulp58tWj+g4ggD0PnSAH9smX5fddLWMjV6h5QcA0AlsjtwXNfeFTOXiixbSh5WQ8oRLk1LEl8uKPB+cENI1CwE8C9/5mv6zfesbPJo1sKzSC/EHk6vTCmf2MnEQGBYFkBBatPiK/j1zt5uWcQCgEOf+Ocrn/K3zf6DxMKKkrgef/WStLXuN7SafzZ7wgH7urv9x9ax+nfCgHAe0JvPz2CXnslcPajyMXAzBakMgxFyFFm0EkgCSdzYqxguS02llAUMpcApxuZz63RgqSCzKZBwIlwkGACzeZzbNxguRWnswCgNzhI8AtQOnPuVGCtG4Cf2fxiPRHT04IhJTALQt2czN5GnNvlCDXPnoNT8ikMelkgYD1xM30Jz4BRAoCxgiSZ6tTzDS7IRBHgGe344Ak2TRCkNav8rwyb1iS4ZEEAQh0ROCupXv5FaAOABkhyNUPV/CTZR1MMrsgoCJg/VTazKeqVbtDn669IK0fu138vQGhn0gAQMApgQV/PMSP7irgaS/Id58YyS+BKyaXZAikQ8D6ZfKbH92VTtbQ5dFakNb/kFnwLX6hJ3RRy4A9J7D4L0f4HzdJqGotSFaPSWaUJAg4IMAqMjk0bQVp/WvWJd8fmHxUpEIAAhkTmP+Hg/xL2Thq2gqSK9dxM8kmBFwS4Ip2IkAtBVkZ+X8yf4s8NcMLAhDwlsA3Ik/XbIs8ZcPrIgEtBclTM4QvBLJDgKdrYrlqKci3F42QwWX5sSNhCwIQcE1gf22L3Lpwt+t6TKlAO0Fyem1K6DGOoBLgNPvKzGgnyPtvK5P5M8qvjIB3EICApwSWrDkqz79V62mdulamnSBffmCITBnVQ1fe9BsCgSfwn51n5e7n9gW+n350UDtB7nh2tBQVdPaDDW1AIJQE6pvbZMxPd4Ry7PGD1kqQIwcUypsLr40fA9sQgIDHBG5f9LHsOtTkca36VaeVIGfcUCpP3zNIP8r0GAKaEXjwpQOy5oM6zXrtfXe1EuS86V+Qn9x+lfcUqBECEIgh8Os3j8nStZ/FpIVxQytBPvfDQfL160vDOE+MGQK+Evj7h3XywO8O+NpmEBvTSpA8fx3EEKJPJhLgueyLs6qVIHmCxsRDkTEFkQBP1GgoyC3LRklpUV4Q44k+QcAoAnUNrTLuoZ1GjcnJYLRaQe5ZPka65nVyMk7KQAACGRA433pBhs/dnkEJM7NqJciaFZVmzgKjgkAACQydsy2AvfK3SwjSX960BgFtCCBIEQSpTbjSUQj4SwBBIkh/I47WIKARAQSJIDUKV7oKAX8JIEgE6W/E0RoENCKAIBGkRuFKVyHgLwEEiSD9jThag4BGBBAkgtQoXOkqBPwlgCARpL8RR2sQ0IgAgkSQGoUrXYWAvwQQJIL0N+JoDQIaEUCQCFKjcKWrEPCXAIJEkP5GHK1BQCMCCBJBahSudBUC/hJAkAjS34ijNQhoRABBIkiNwpWuQsBfAggSQfobcbQGAY0IIEgEqVG4etfVLqVl0rmopL3CtoYz8nldrXeVU5MxBBAkgjQmmNMZSH6/YVJYUSmdu3WPyd7WeE6aqrdJy5G9MelshJsAgkSQoTkCul1znRQMHd3heJtrdkjjJx91mIed4SGAIBFkKKLdWjkWjbkprbE2bH+flWRapMzPhCARpPlRHhlhyeTpCafVqoFbp9tnNqxV7SY9RAQQJII0PtytCzLdr5+W0TjPfbiOCzcZETMzM4JEkGZGdtSo8vtXSNHoG6NSUr9t2LFRWg5Xp85IDqMJIEgEaXSAW4NDkMZPcdYGiCARZNaCKygVc4odlJnQrx8IEkHqF7UOesxFGgfQKCIIEkGG4jDgNp9QTLPng0SQCNLzoApqhUG4UTyvqFvkdqOCdkRtjc3S2tAYVFz0K0IAQSJI4w6Eqr1Nl8e0+dL7qr0XRTRlyiiZceckGTSg9HIe682BQ3XyzMp/y6tvbItJT3djwrDC9qwThnW7XGT85bTCyHPfhVI4sFzyehRf3m+9aT1bL00Hj0pbw5U+x2RgI6cEECSCzGkAOmncFqAlP1t8Vj12ejp1TrhukAy9und71ppPT0rVRwfSKeYoz5jhPeVPT0+Sgvy8pOXbWtukcU8NkkxKJ7eJCBJB5jYCU7RuS8+Wob2doligdq9adpNMrOzTYZ82bT0hy5ZvEXsFaq0+7VVphwXZmVUCCBJBZjXAMq3cEqAtQ6usjkKMHvOY4aWyZvnk6CTl+xlzN8j2PXUx+y1JIs0YJL5uIEgE6WvARTdmy2/l+lPtyfZ2dB7d339z2iD55cNfSmsYP3/qv/LXdalP9ZFmWjg9yYQgEaQngZRuJZYELSE2dSmUEUN6tBfbve9swsop3fqCni8bgkw25hfv68cpeTIwLtMQJIJ0GUKpi9tStP5aFyx+MXuUTBwb+53cpm0n5PEVOyOiPJ26Qo1yuD3FTneo1qrSkiQvbwkgSATpbURdqi1ainYDqa7mNre0yncefM84Sa5aGrlIE/eBYDOx/1ofELMeet/edPSXVaQjbB0WQpAIssMAyWRnMilGl0/3au6see5EEd1mEN779cHAKtL72UaQCNJxVFlCtF7Wd4r2e1Vlfp1qqtrPdXr7VwtzIl8txN3uY93e8/hK775aYBXp7UwjSASZcUSlWikmq9CvixXJ2g5SmvVBkc2LU6wivZ1tBIkg044oJ2K0K0eQNons/2UV6R1jBIkgU0aTGzHalYf9FNvm4MdfVpHeUUaQCDJpNHkhxfiK/bqaG99uGLdZRXoz6wgSQcZEUjbEaDfg19Vcu70w/2UV6c3sI0gE2R5J2RRjdKj6dTU3us2wvmcV6X7mEWTIBblyfV37T4ZZgvTzle2ruX6OJahtsYp0PzMIMqSC9GvF6D5EqcENAVaRbujxi+IWvU5FRSUX3GH0r3TNikpXjSFGV/i0K8wq0t2UsYIMiSARo7sDRefSrCKdzx6CDIEgre8ZV1z6zUXnoUJJXQmwinQ+cwjSYEFaq8Z7XzjiPDooaQwBVpHOphJBGihITqedHQwml2IV6Wx2EaRBgkSMzg6CsJRiFZn5TCNIQwTJ94yZB3/YSrCKzHzGn339WEKhZ17/LCHN5AQjbvNBkCaHqHdjYxXpnuXGPfXy3WV73VekSQ0IUpOJopvuCbCKdM/QqiFMkkSQ3sQMtWhCgFWkNxNlrSItUZr+QpCmzzDjiyHAKjIGh+ONsKwiEaTjEKGgrgRyvYq07rjY7PMPpLidq9lTSxOqsC7imH7RBkEmTDsJphPI9SpSx4uKqg8V00+1EaTpNmB8SQmoDvikmT1O1FGQqg8V00+1EaTHwU91ehBQHfB+9F5HQVpc5kztJclOtU1eRSJIP44I2ggkgVytInUVpDWJKmamPnWDIAN56NIpPwjkahWpsyBVzEw91UaQfhyJtBFYAqoVUTY7rBLk9Ak9ZMEdfaRrXqdsNp9Q9/nWC7L4tROytupswr5kCSpmJp5qI8hkEUBaaAioVkTZBKAS5KbFQ3yXoz1OS5ITF+yzN1P+3fLk0IQ8Jq4iEWTCNJMQNgLJDvZsMlAJ0u9+xI9x3CM18UnKbdUHi2n3RiJIZQiwIywEVFdnszV+EwRpsQnDqfb/AQAA//88vZenAAAN7ElEQVTtnXtwFdUZwD8SeTQpgQChIDIBU1u0pdQBH33RP6QOrXWktrYFx3YcKY+2OGNrHZTWP6wg47RQsYwIOI61Yi1TqxWqozDTh7bUwjA09VFsgBQRSMLbSHiE9B6dKze59yTZ3bPn7Nn93ZnMvdm7e863v++7v3vO3b13+1RUVHWIJ7edK8aXjPTBDYdlxYZDJZ9jIQR6Q2Dr4rG9Wc3IOrp6tRlDqR25eP7OUou1yyadP0BWzRpZ9Pym7a0yfcmOouU+LuiDIH1MGzGbJjBnSrXMnjLYdLMl20uLINXO6bgpQSpR+n5DkL5nkPiNEbA1gkuTIBV8NYpUo8mut7Fz6rsu8u5/BOldygg4LgK60ZDp/tImyDRPtRGk6eqnPa8J2BhFpk2QKuG6UaTvU20E6fXLmeBNE7AxikyjIFUeSr25+H7ABkGafoXRnvcESr3QTe5UWgWpm2rft65JfrFuv0mE1tpCkNZQ05EvBHTTRVPxp1WQio+Ona9TbQRpquppJzUEdCMhUzuYZkHq2Pk61UaQpqqedlJFQDcSMrGTaRak4qP7HNfHUSSCNFHxtJE6ArqRkIkd1Qny5YVjpG95HxNdBG7jVHuHXLpgV+DtdBvo3mB8OzcSQeoyzPLME9C9yKOC0QnymkkDZcFXhlqXpJLjwt8fkKc3H4u6a+9vr3uD8W2qjSDfTykPINCZgO5F3nmt4P/pBBm8pWRvoXuD8WmqjSCTXWNE55iA7kUeJaysCFIxKnXKlE+jSAQZpdLZNvUE4hhFZkmQOn6+nBuJIFP/EmcHoxIwPYrMkiAVex0/H6baCDLqq4ftU09ANwoKu+NZE6SOnw9TbQQZtsrZLlMEdKOgMBCyJkjFyNdzIxFkmApnm8wR0I2CwoDIoiAVJ92bTJLPjUSQYSqcbTJJQPcCDwojq4LUvckk+bNIBBm0ulk/swR0L/CgQLIqSMWp1JtMko9oI8ig1c36mSZQ6gUeFEiWBVnqs0gEGbSCNOtzVUMNGBZbI2BiFIkgO18cDUEaKl8EaQgkzUQiEHUUiSARZKQC1G2MIHVkWG6TQNRRJIJEkLHUK4KMBSuNhiAQZRSJIBFkiJLreRME2TMj1rBDIMooEkEiyFiqFEHGgpVGQxIIO4pEkAgyZMl1vxmC7J4Pz9olEHYUiSARZCyViiBjwUqjEQiEGUUiSAQZoeT0myJIPRuecUMgzCgSQSLIWKoVQcaClUYjEgg6ikSQCDJiyZXeHEGW5sJStwSCjiIRJIKMpWIRZCxYadQAgSCjSASJIA2UXHETCLKYCUuSQSDIKBJBIshYqhZBxoKVRg0R6O0oEkEiSEMl17kZBNmZB/8li0BvR5EIEkHGUrkIMhasNGqQQG9GkQgSQRosubNNIcizLHiUTAK9GUUiSAQZS/UiyFiw0qhhAlsXj+22RQSJILstkLBPIsiw5NjOJoFSlxUo7B9BIsjCejD2GEEaQ0lDMRPobhSJIBFkLOWHIGPBSqMxEOhuFIkgEWQMJSeiE+TmHW2yJffHDQJJIjB7SmcR5GPLcr1OPH+AqANZhTcu2lVII8JjnSAjNMmmEICAYwII0lACEKQhkDQDgQQRQJCGkoEgDYGkGQgkiACCNJQMBGkIJM1AICEENm1vlelLdiQkmuIw+lRUVHUUL07mEgSZzLwQVToJqJFdnLdN298WJcgk3xBkkrNDbBBwSGDsnHqHvSejawSZjDwQBQQSRwBBiiDIxJUlAUEgGQQQJIJMRiUSBQQSSABBIsgEliUhQSAZBBAkgkxGJRIFBBJIAEEiSKNlefJ0h2xrPCG7mk/KodYz77ZdXVkmY2r6yYTa/tLvnD5G+6MxCBQSMF1/CBJBFtZX6Mf/bGiTJ18+Ks/Xt8qZ97xY1FZZmciV4yvl2kur5JK6zl/WL1qZBRAIQCCu+kOQCDJAGRav2ny0XZasPyDPbQt2suvUCZVyy1VDZXhVeXGjLIFALwnEXX93r90rD21s6WU06VyN03xC5lW9a9/xmyZpOdYeqoVhA8tl0TeHM5oMRY+NbNRf26kzMnnBf6T56OnMAkeQIVKvinPOQ3u10+neNqmm3StuGokkewuM9d4lYLP+Vr3QIot+tzez5BFkwNQ35abV19+/J/TIsWt3aiS5Zt4oqWG63RUN/5cgYLv+1Chy4q2vyTsnNB+ul4gxTYsQZMBs3v54U+DPHHvqQn0mec/04T2txvMQEBf1N//Xe+SJFw9mkj6CDJB2NbWZtSqe6cbK7zDVDpCKTK7qqv421h+Tmct3ZZI5ggyQ9jjevfPdM4rMk+BeR8BV/alp9oXzXtGFlerlCLKX6VUn4X7qzl2RD8zoulMHbP5+1xhOJtcByvhy1/X35YX/lVd2H89cFrwS5PblH5e+5W6+jRLn9CZfdUyz8yS470rAdf3NW/0/Wbf5SNewUv+/V4LcuuQiGVzh5uTqtZuOyqKnDsRaEHdMGyrXXV4Vax807icB1/WX1ZPGvRLkn376UanNfa/ZxW3lxsPywAuHYu167heqZdYVpa+lHGvHNJ54Aq7rb+kz+2XZ+ngvwZDEJHglyLU/qpNJdRVOOLouUCc7TaeJIeC6/hBkYkpBH8iym0bL1Ze4GWG5nuLoqfBMFgi4rj+m2B5U2Q+v+ZB8/4tuTqh2/SG5B+khxBgJuK4/DtLEmFxTTU+7bLAsvXG0qeYCteP6NItAwbJy6gi4rj9O8/GgpMaNGiDP/uQCZ5G6OlHX2Q7TcaIIuKo/ThRPVBl0H8y/7/uYVPbPnVXt4BbnNIdzIB0k1LMuXdUfXzX0qFAeuXmMTL5ooLOI43gX52uGztLpXccu6o8fq/CoTOZOrZHbpo1wFrH6FecZhn/u7LHcz53x6+LOUupVx7brj587q6jq8KlCxtd+QP5w+4edhqymOvxgrtMUZLpzm/XHD+Z6Jkj1ynD5jZr8K1MVKZdcyNPg3jYBG/WnRo9ccsFDQc6/doTMvrLGdk0W9ad+3XlpyIt2/SB30S5+RbwIKQsCEIi7/rJ6cnhhCrz6qmE+8CRMs/OxqHv1bs5lXwuJ8NgmgTjqL8tHrgtz56Ug1Q64/F52IcDCx+pk3m2NJ2RX80k51PreNTyqK8tkTO4HNibU9ue3Hgth8dg4AVP115ir36/e2yAHjmX3aob55HgryOs+XS33fuu8/H5wDwEIGCDQkpPit5ftlFd3txlozf8mvBWkQv/SPePk3Oq+/meBPYBAAgiokeN3VzYix4JceC3ImVOGyYKvjSzYHR5CAAJhCLyxt02mL9nJtLoLPK8FqfaFUWSXjPIvBAISOHK8XT55y6sBt8rG6kYFedf0c+X6yUOlzM1lY7KRMfYSAhAoSeBM7isvj/3lgNz5+Fslnw+z0JgglRxv+PzQMDGwDQQgAAFjBB79szlJGhNkwwPjGTkaSzENQQACYQmokWTd3Pqwm3faDkF2wsE/EICA7wQSKUim2L6XFfFDIB0EEjnFVmg5SJOOAmMvIOAjgUQfpEkKUL5hk5RMEEdSCdz2qzdl7d/ivcZ7Uvc9aFzGPoMM2nGc67u8+mGc+0XbEIhK4JfPNsnPn94ftZnMbJ9KQarsLb5hlHzjM0Myk0h2FAI9EXjipYMy/9E9Pa3G8wUEUitItY/LZo6WqycNLthdHkIgmwSe2XxYbl69O5s7H2GvUy1IxQVJRqgONk0FAeQYPo2pF6RCw3Q7fIGwpd8EmFZHy18mBKkQceAmWqGwtX8EOCATPWeZEaRCxSlA0QuGFvwgwKk8ZvKUKUEqZOp6NnfPGCWfyN1zg0DaCPyr8bj8eM0eqc/dc4tOIHOCzCNLypUR8/FwD4GoBB58vlkWP7kvajNsX0Ags4JUDC67oFJunTZCJtVVFCDhIQT8IrC54R352VP75B9vtPoVuAfRZlqQ+fzM+NwQ+d6XhnN9mzwQ7r0g8NahU7L8j02y5q8HvYjXxyARZEHW1DVubrxiGKIsYMLD5BFQYnx4Y4us3tCSvOBSFhGCLJFQdbT767mvKTL1LgGHRc4IqKn0b3NfF+SHJuylAEF2w1od8b5q4iCZevEgqa3p182aPAWBeAioS7E+t/WIrN9yhCPT8SDutlUE2S2es08qWX72wg/K5R+pzI0sK6Wif9nZJ3kEAUMEWk+ckS0NrbJpe6u8+NrbSNEQ17DNIMiQ5MaNGiDjzhsgdSP6S+2wfjJySD+pqTpHBlWWS2VOnn3LubRjSLSp3uxUe4coCR5pbZfmo6dl78GT0thyUhr2nZDX32yT1/e0pXr/fds5BOlbxogXAhCwRgBBWkNNRxCAgG8EEKRvGSNeCEDAGgEEaQ01HUEAAr4RQJC+ZYx4IQABawQQpDXUdAQBCPhGAEH6ljHihQAErBFAkNZQ0xEEIOAbAQTpW8aIFwIQsEYAQVpDTUcQgIBvBBCkbxkjXghAwBoBBGkNNR1BAAK+EUCQvmWMeCEAAWsEEKQ11HQEAQj4RgBB+pYx4oUABKwRQJDWUNMRBCDgGwEE6VvGiBcCELBGAEFaQ01HEICAbwQQpG8ZI14IQMAaAQRpDTUdQQACvhFAkL5ljHghAAFrBBCkNdR0BAEI+EYAQfqWMeKFAASsEUCQ1lDTEQQg4BsBBOlbxogXAhCwRgBBWkNNRxCAgG8EEKRvGSNeCEDAGgEEaQ01HUEAAr4RQJC+ZYx4IQABawQQpDXUdAQBCPhGAEH6ljHihQAErBFAkNZQ0xEEIOAbAQTpW8aIFwIQsEbg/5l+gCk3m6OaAAAAAElFTkSuQmCC" alt="logo" className="w-9 h-9 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Transporte JR</p>
              <p className="text-zinc-500 text-xs">Gestión operativa</p>
            </div>
            <button onClick={onToggle} title="Colapsar menú"
              className="text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg p-1.5 transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
        {visible.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className={`py-4 border-t border-zinc-800 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{session.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{session.name}</p>
              <p className="text-zinc-500 text-xs capitalize">{session.role.toLowerCase()}</p>
            </div>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${
              collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2'
            }`}
          >
            <span className="text-base w-5 text-center flex-shrink-0">→</span>
            {!collapsed && 'Cerrar sesión'}
          </button>
        </form>
      </div>
    </aside>
  )
}
