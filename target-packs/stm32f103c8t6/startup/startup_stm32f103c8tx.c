/* Vector table and startup code for STM32F103C8Tx
 *
 * Complete Cortex-M vector table (all device interrupts). Every handler is a
 * weak alias of Default_Handler, so application/HAL code overrides a handler
 * simply by defining a function with the same name (e.g. SysTick_Handler,
 * USART2_IRQHandler). Interrupt names match the CMSIS device header IRQn_Type.
 */
#include <stdint.h>

extern uint32_t _estack;
extern uint32_t _sdata;
extern uint32_t _edata;
extern uint32_t _sidata;
extern uint32_t _sbss;
extern uint32_t _ebss;

extern int main(void);
extern void __libc_init_array(void);
void SystemInit(void) __attribute__((weak));
void SystemInit(void) {}

void Reset_Handler(void);
void Default_Handler(void);

void Reset_Handler(void) {
    uint32_t *src = &_sidata;
    uint32_t *dst = &_sdata;
    while (dst < &_edata) {
        *dst++ = *src++;
    }
    dst = &_sbss;
    while (dst < &_ebss) {
        *dst++ = 0;
    }
    SystemInit();
    __libc_init_array();
    (void)main();
    while (1) {
    }
}

void Default_Handler(void) {
    while (1) {
    }
}

void NMI_Handler(void) __attribute__((weak, alias("Default_Handler")));
void HardFault_Handler(void) __attribute__((weak, alias("Default_Handler")));
void MemManage_Handler(void) __attribute__((weak, alias("Default_Handler")));
void BusFault_Handler(void) __attribute__((weak, alias("Default_Handler")));
void UsageFault_Handler(void) __attribute__((weak, alias("Default_Handler")));
void SVC_Handler(void) __attribute__((weak, alias("Default_Handler")));
void DebugMon_Handler(void) __attribute__((weak, alias("Default_Handler")));
void PendSV_Handler(void) __attribute__((weak, alias("Default_Handler")));
void SysTick_Handler(void) __attribute__((weak, alias("Default_Handler")));
void WWDG_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void PVD_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TAMPER_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RTC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void FLASH_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RCC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel6_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Channel7_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void ADC1_2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USB_HP_CAN1_TX_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USB_LP_CAN1_RX0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_RX1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_SCE_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI9_5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_BRK_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_UP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_TRG_COM_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_CC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C1_EV_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C1_ER_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C2_EV_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C2_ER_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void SPI1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void SPI2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USART1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USART2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USART3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI15_10_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RTC_Alarm_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USBWakeUp_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));

__attribute__((section(".isr_vector"), used))
const void * const g_pfnVectors[] = {
    (void *)&_estack,
    (void *)Reset_Handler,
    (void *)NMI_Handler,
    (void *)HardFault_Handler,
    (void *)MemManage_Handler,
    (void *)BusFault_Handler,
    (void *)UsageFault_Handler,
    (void *)0,
    (void *)0,
    (void *)0,
    (void *)0,
    (void *)SVC_Handler,
    (void *)DebugMon_Handler,
    (void *)0,
    (void *)PendSV_Handler,
    (void *)SysTick_Handler,
    (void *)WWDG_IRQHandler,
    (void *)PVD_IRQHandler,
    (void *)TAMPER_IRQHandler,
    (void *)RTC_IRQHandler,
    (void *)FLASH_IRQHandler,
    (void *)RCC_IRQHandler,
    (void *)EXTI0_IRQHandler,
    (void *)EXTI1_IRQHandler,
    (void *)EXTI2_IRQHandler,
    (void *)EXTI3_IRQHandler,
    (void *)EXTI4_IRQHandler,
    (void *)DMA1_Channel1_IRQHandler,
    (void *)DMA1_Channel2_IRQHandler,
    (void *)DMA1_Channel3_IRQHandler,
    (void *)DMA1_Channel4_IRQHandler,
    (void *)DMA1_Channel5_IRQHandler,
    (void *)DMA1_Channel6_IRQHandler,
    (void *)DMA1_Channel7_IRQHandler,
    (void *)ADC1_2_IRQHandler,
    (void *)USB_HP_CAN1_TX_IRQHandler,
    (void *)USB_LP_CAN1_RX0_IRQHandler,
    (void *)CAN1_RX1_IRQHandler,
    (void *)CAN1_SCE_IRQHandler,
    (void *)EXTI9_5_IRQHandler,
    (void *)TIM1_BRK_IRQHandler,
    (void *)TIM1_UP_IRQHandler,
    (void *)TIM1_TRG_COM_IRQHandler,
    (void *)TIM1_CC_IRQHandler,
    (void *)TIM2_IRQHandler,
    (void *)TIM3_IRQHandler,
    (void *)TIM4_IRQHandler,
    (void *)I2C1_EV_IRQHandler,
    (void *)I2C1_ER_IRQHandler,
    (void *)I2C2_EV_IRQHandler,
    (void *)I2C2_ER_IRQHandler,
    (void *)SPI1_IRQHandler,
    (void *)SPI2_IRQHandler,
    (void *)USART1_IRQHandler,
    (void *)USART2_IRQHandler,
    (void *)USART3_IRQHandler,
    (void *)EXTI15_10_IRQHandler,
    (void *)RTC_Alarm_IRQHandler,
    (void *)USBWakeUp_IRQHandler,
};
