/** Small vector mascot; its greeting finishes within three seconds. */
export default function Corgi() {
  return (
    <svg
      className="corgi-friend"
      viewBox="0 0 300 270"
      role="img"
      aria-labelledby="corgi-title"
    >
      <title id="corgi-title">A happy little corgi waving hello</title>
      <circle cx="153" cy="142" r="104" fill="#eee3f5" />
      <ellipse cx="152" cy="244" rx="85" ry="10" fill="#d6bfdc" opacity=".45" />
      <g className="corgi-tail">
        <path
          d="M94 205Q38 202 52 167Q66 151 73 177Q79 187 100 178"
          fill="#e8a35e"
          stroke="#a9673e"
          strokeWidth="3"
        />
        <path d="M52 167Q66 151 73 177L63 187Q48 186 52 167" fill="#fff8e9" />
      </g>
      <path
        d="M93 182Q93 149 152 147Q207 151 210 192L205 235H97Z"
        fill="#e8a35e"
        stroke="#a9673e"
        strokeWidth="3"
      />
      <ellipse cx="153" cy="201" rx="38" ry="39" fill="#fff8e9" />
      <path
        d="M104 111 89 30Q87 18 101 25L142 66H165L205 26Q220 14 216 34L207 114"
        fill="#e8a35e"
        stroke="#a9673e"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="m100 40 8 43 21-13zm104 1-23 30 22 13z" fill="#eda6a3" />
      <g className="corgi-head">
        <path
          d="M100 91Q104 62 153 62Q204 61 213 97Q232 158 195 178Q154 202 111 176Q78 158 100 91Z"
          fill="#edb16c"
          stroke="#a9673e"
          strokeWidth="3"
        />
        <path
          d="M148 64Q144 96 128 119Q100 120 101 149Q113 180 153 181Q194 180 207 149Q209 120 179 119Q164 95 159 64"
          fill="#fff8e9"
        />
        <g className="corgi-eyes" fill="#493b39">
          <ellipse cx="122" cy="111" rx="6" ry="8" />
          <ellipse cx="185" cy="111" rx="6" ry="8" />
        </g>
        <g fill="#fff">
          <circle cx="124" cy="108" r="2" />
          <circle cx="187" cy="108" r="2" />
        </g>
        <g fill="#e9a0a1" opacity=".7">
          <ellipse cx="111" cy="135" rx="11" ry="6" />
          <ellipse cx="195" cy="135" rx="11" ry="6" />
        </g>
        <path
          d="M143 132Q153 126 163 132L155 140Q153 142 151 140Z"
          fill="#493b39"
        />
        <path
          d="M136 146Q153 161 171 146"
          stroke="#493b39"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M147 152Q148 173 158 165Q164 159 161 153" fill="#dc8990" />
      </g>
      <path
        d="M110 180Q153 199 195 180L193 193Q155 211 112 193Z"
        fill="#9b7bb9"
      />
      <path
        d="M151 201Q145 194 140 200Q135 207 153 219Q170 206 165 200Q159 194 153 201"
        fill="#f9d77d"
        stroke="#ad8746"
        strokeWidth="1.5"
      />
      <path
        d="M97 220Q80 238 99 245H126Q140 233 124 220M181 222Q165 237 182 245H208Q224 234 205 221"
        fill="#fff8e9"
        stroke="#a9673e"
        strokeWidth="3"
      />
      <g className="corgi-paw">
        <path
          d="M205 199Q225 200 237 176Q249 151 234 144Q218 137 214 165L196 179"
          fill="#fff8e9"
          stroke="#a9673e"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse
          cx="229"
          cy="164"
          rx="7"
          ry="9"
          fill="#e7a5ae"
          transform="rotate(20 229 164)"
        />
        <g fill="#e7a5ae">
          <circle cx="224" cy="151" r="3" />
          <circle cx="233" cy="151" r="3" />
          <circle cx="238" cy="158" r="3" />
        </g>
      </g>
      <g
        className="corgi-sparkles"
        stroke="#ae7b56"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="m248 79 2-11m-5 6 10 2M54 105l-4-8m0 7 8-4" />
      </g>
      <path
        d="M43 210q-9-12-16-4-7 8 16 22 22-19 13-25-8-5-13 7"
        fill="#dfa0ab"
      />
      <g transform="translate(255 220)">
        <g fill="#f0b7bc">
          <ellipse ry="12" rx="5" />
          <ellipse ry="12" rx="5" transform="rotate(60)" />
          <ellipse ry="12" rx="5" transform="rotate(120)" />
        </g>
        <circle r="5" fill="#f4d478" />
      </g>
    </svg>
  );
}
