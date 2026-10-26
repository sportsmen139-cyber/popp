import type { EquipmentId } from '../types/equipment'

/** Display labels only. Configured machine/attachment capabilities are explicit. */
export const equipmentLabels: Record<EquipmentId, string> = {
  barbell: 'Штанга', dumbbells: 'Гантели', kettlebell: 'Гиря',
  bench: 'Устойчивая горизонтальная скамья', adjustable_bench: 'Регулируемая скамья', rack: 'Стойки для штанги с упорами',
  pull_up_bar: 'Турник', resistance_band: 'Резинка',
  stable_support: 'Устойчивая опора для рук или задней ноги', step_platform: 'Устойчивая платформа для зашагиваний',
  lat_pulldown_machine: 'Станция вертикальной тяги с рукоятью', assisted_pull_up_machine: 'Гравитрон для подтягиваний',
  cable_row_machine: 'Станция горизонтальной тяги с рукоятью', t_bar_row_station: 'Оборудованная станция Т-тяги',
  cable_station: 'Кроссовер с верхним/нижним блоками и стандартной рукоятью', ankle_cuff: 'Манжета для ноги на блоке',
  chest_press_machine: 'Тренажёр жима от груди', incline_chest_press_machine: 'Тренажёр наклонного жима',
  pec_deck_machine: 'Тренажёр сведения рук', leg_press_machine: 'Тренажёр жима ногами',
  hyperextension_bench: 'Скамья для гиперэкстензии', hip_abduction_machine: 'Тренажёр отведения бедра',
  hip_extension_machine: 'Тренажёр разгибания бедра', leg_extension_machine: 'Тренажёр разгибания колена',
  calf_raise_machine: 'Тренажёр подъёма на носки', hip_adduction_machine: 'Тренажёр приведения бедра',
}
