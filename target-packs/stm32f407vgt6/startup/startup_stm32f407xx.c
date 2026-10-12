/* Vector table and startup code for STM32F407VGT6
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
void TAMP_STAMP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RTC_WKUP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void FLASH_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RCC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream6_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void ADC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_TX_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_RX0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_RX1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN1_SCE_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void EXTI9_5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_BRK_TIM9_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_UP_TIM10_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM1_TRG_COM_TIM11_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
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
void OTG_FS_WKUP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM8_BRK_TIM12_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM8_UP_TIM13_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM8_TRG_COM_TIM14_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM8_CC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA1_Stream7_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void FSMC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void SDIO_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void SPI3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void UART4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void UART5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM6_DAC_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void TIM7_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream2_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream3_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream4_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void ETH_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void ETH_WKUP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN2_TX_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN2_RX0_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN2_RX1_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void CAN2_SCE_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void OTG_FS_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream5_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream6_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DMA2_Stream7_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void USART6_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C3_EV_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void I2C3_ER_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void OTG_HS_EP1_OUT_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void OTG_HS_EP1_IN_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void OTG_HS_WKUP_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void OTG_HS_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void DCMI_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void RNG_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));
void FPU_IRQHandler(void) __attribute__((weak, alias("Default_Handler")));

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
    (void *)TAMP_STAMP_IRQHandler,
    (void *)RTC_WKUP_IRQHandler,
    (void *)FLASH_IRQHandler,
    (void *)RCC_IRQHandler,
    (void *)EXTI0_IRQHandler,
    (void *)EXTI1_IRQHandler,
    (void *)EXTI2_IRQHandler,
    (void *)EXTI3_IRQHandler,
    (void *)EXTI4_IRQHandler,
    (void *)DMA1_Stream0_IRQHandler,
    (void *)DMA1_Stream1_IRQHandler,
    (void *)DMA1_Stream2_IRQHandler,
    (void *)DMA1_Stream3_IRQHandler,
    (void *)DMA1_Stream4_IRQHandler,
    (void *)DMA1_Stream5_IRQHandler,
    (void *)DMA1_Stream6_IRQHandler,
    (void *)ADC_IRQHandler,
    (void *)CAN1_TX_IRQHandler,
    (void *)CAN1_RX0_IRQHandler,
    (void *)CAN1_RX1_IRQHandler,
    (void *)CAN1_SCE_IRQHandler,
    (void *)EXTI9_5_IRQHandler,
    (void *)TIM1_BRK_TIM9_IRQHandler,
    (void *)TIM1_UP_TIM10_IRQHandler,
    (void *)TIM1_TRG_COM_TIM11_IRQHandler,
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
    (void *)OTG_FS_WKUP_IRQHandler,
    (void *)TIM8_BRK_TIM12_IRQHandler,
    (void *)TIM8_UP_TIM13_IRQHandler,
    (void *)TIM8_TRG_COM_TIM14_IRQHandler,
    (void *)TIM8_CC_IRQHandler,
    (void *)DMA1_Stream7_IRQHandler,
    (void *)FSMC_IRQHandler,
    (void *)SDIO_IRQHandler,
    (void *)TIM5_IRQHandler,
    (void *)SPI3_IRQHandler,
    (void *)UART4_IRQHandler,
    (void *)UART5_IRQHandler,
    (void *)TIM6_DAC_IRQHandler,
    (void *)TIM7_IRQHandler,
    (void *)DMA2_Stream0_IRQHandler,
    (void *)DMA2_Stream1_IRQHandler,
    (void *)DMA2_Stream2_IRQHandler,
    (void *)DMA2_Stream3_IRQHandler,
    (void *)DMA2_Stream4_IRQHandler,
    (void *)ETH_IRQHandler,
    (void *)ETH_WKUP_IRQHandler,
    (void *)CAN2_TX_IRQHandler,
    (void *)CAN2_RX0_IRQHandler,
    (void *)CAN2_RX1_IRQHandler,
    (void *)CAN2_SCE_IRQHandler,
    (void *)OTG_FS_IRQHandler,
    (void *)DMA2_Stream5_IRQHandler,
    (void *)DMA2_Stream6_IRQHandler,
    (void *)DMA2_Stream7_IRQHandler,
    (void *)USART6_IRQHandler,
    (void *)I2C3_EV_IRQHandler,
    (void *)I2C3_ER_IRQHandler,
    (void *)OTG_HS_EP1_OUT_IRQHandler,
    (void *)OTG_HS_EP1_IN_IRQHandler,
    (void *)OTG_HS_WKUP_IRQHandler,
    (void *)OTG_HS_IRQHandler,
    (void *)DCMI_IRQHandler,
    (void *)0, /* reserved on this device */
    (void *)RNG_IRQHandler,
    (void *)FPU_IRQHandler,
};
