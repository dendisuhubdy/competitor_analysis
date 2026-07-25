'use client'

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import type { Positioning } from '@/lib/analysis/schema'

export default function PositioningMap({
  positioning,
}: {
  positioning: Positioning
}) {
  const you = positioning.points.filter((p) => p.isYou)
  const them = positioning.points.filter((p) => !p.isYou)

  return (
    <div>
      <p className="mb-4 text-sm text-neutral-400">{positioning.rationale}</p>

      <div className="h-96 w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid stroke="#262626" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              tick={false}
              stroke="#525252"
              label={{
                value: `${positioning.xAxis.lowLabel} → ${positioning.xAxis.highLabel}`,
                position: 'insideBottom',
                offset: -12,
                fill: '#a3a3a3',
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              tick={false}
              stroke="#525252"
              label={{
                value: `${positioning.yAxis.lowLabel} → ${positioning.yAxis.highLabel}`,
                angle: -90,
                position: 'insideLeft',
                fill: '#a3a3a3',
                fontSize: 12,
              }}
            />
            <ZAxis range={[140, 140]} />
            <Scatter data={them} fill="#737373">
              <LabelList dataKey="name" position="top" fill="#a3a3a3" fontSize={11} />
            </Scatter>
            <Scatter data={you} fill="#34d399">
              <LabelList dataKey="name" position="top" fill="#34d399" fontSize={12} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex gap-6 text-xs text-neutral-500">
        <span>
          <strong className="text-neutral-300">X</strong> {positioning.xAxis.label}
        </span>
        <span>
          <strong className="text-neutral-300">Y</strong> {positioning.yAxis.label}
        </span>
      </div>
    </div>
  )
}
