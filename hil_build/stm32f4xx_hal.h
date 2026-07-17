#ifndef STM32_MOCK_HAL_H
#define STM32_MOCK_HAL_H

#include <stdint.h>
#include <stdbool.h>

// Types
typedef struct {
    uint32_t Pin;
    uint32_t Mode;
    uint32_t Pull;
    uint32_t Speed;
    uint32_t Alternate;
} GPIO_InitTypeDef;

typedef struct {
    void* Instance;
    struct {
        uint32_t BaudRate;
        uint32_t WordLength;
        uint32_t StopBits;
        uint32_t Parity;
        uint32_t Mode;
        uint32_t HwFlowCtl;
        uint32_t OverSampling;
    } Init;
} UART_HandleTypeDef;

typedef struct {
    void* Instance;
    struct {
        uint32_t Mode;
        uint32_t Direction;
        uint32_t DataSize;
        uint32_t CLKPolarity;
        uint32_t CLKPhase;
        uint32_t NSS;
        uint32_t BaudRatePrescaler;
    } Init;
} SPI_HandleTypeDef;

typedef struct {
    void* Instance;
    struct {
        uint32_t ClockPrescaler;
        uint32_t Resolution;
        uint32_t ScanConvMode;
        uint32_t ContinuousConvMode;
        uint32_t DiscontinuousConvMode;
        uint32_t ExternalTrigConvEdge;
        uint32_t ExternalTrigConv;
        uint32_t DataAlign;
        uint32_t NbrOfConversion;
    } Init;
} ADC_HandleTypeDef;

typedef struct {
    void* Instance;
} DAC_HandleTypeDef;

typedef struct {
    uint32_t DAC_Trigger;
    uint32_t DAC_OutputBuffer;
} DAC_ChannelConfTypeDef;

typedef struct {
    void* Instance;
    struct {
        uint32_t Prescaler;
        uint32_t CounterMode;
        uint32_t Period;
        uint32_t ClockDivision;
    } Init;
} TIM_HandleTypeDef;

typedef struct {
    uint32_t OCMode;
    uint32_t Pulse;
    uint32_t OCPolarity;
    uint32_t OCFastMode;
} TIM_OC_InitTypeDef;

// Pins & Constants
#define GPIO_PIN_0 0
#define GPIO_PIN_1 1
#define GPIO_PIN_2 2
#define GPIO_PIN_3 3
#define GPIO_PIN_4 4
#define GPIO_PIN_5 5
#define GPIO_PIN_6 6
#define GPIO_PIN_7 7
#define GPIO_PIN_8 8
#define GPIO_PIN_9 9
#define GPIO_PIN_10 10
#define GPIO_PIN_11 11
#define GPIO_PIN_12 12
#define GPIO_PIN_13 13
#define GPIO_PIN_14 14
#define GPIO_PIN_15 15

#define GPIO_MODE_INPUT 0
#define GPIO_MODE_OUTPUT_PP 1
#define GPIO_MODE_AF_PP 2

#define GPIO_NOPULL 0
#define GPIO_PULLUP 1

#define GPIO_SPEED_FREQ_LOW 0
#define GPIO_SPEED_FREQ_MEDIUM 1
#define GPIO_SPEED_FREQ_HIGH 2
#define GPIO_SPEED_FREQ_VERY_HIGH 3

#define GPIO_AF7_USART2 7
#define GPIO_AF7_USART3 7
#define GPIO_AF5_SPI1 5

typedef enum {
    GPIO_PIN_RESET = 0,
    GPIO_PIN_SET = 1
} GPIO_PinState;

#define HAL_OK 0
#define HAL_ERROR 1

#define UART_WORDLENGTH_8B 8
#define UART_STOPBITS_1 1
#define UART_PARITY_NONE 0
#define UART_MODE_TX_RX 1
#define UART_MODE_TX 2
#define UART_MODE_RX 3
#define UART_HWCONTROL_NONE 0
#define UART_OVERSAMPLING_16 16

#define SPI_MODE_MASTER 1
#define SPI_DIRECTION_2LINES 2
#define SPI_DATASIZE_8BIT 8
#define SPI_POLARITY_LOW 0
#define SPI_PHASE_1EDGE 1
#define SPI_NSS_SOFT 0
#define SPI_BAUDRATEPRESCALER_16 16

#define ADC_CLOCK_SYNC_PCLK_DIV4 4
#define ADC_RESOLUTION_12B 12
#define DISABLE 0
#define ENABLE 1
#define ADC_DATAALIGN_RIGHT 0
#define ADC_EXTERNALTRIGCONVEDGE_NONE 0
#define ADC_SOFTWARE_START 0

#define DAC_TRIGGER_NONE 0
#define DAC_OUTPUTBUFFER_ENABLE 1
#define DAC_CHANNEL_1 1
#define DAC_ALIGN_12B_R 12

#define TIM_OCMODE_PWM1 1
#define TIM_OCPOLARITY_HIGH 1
#define TIM_OCFAST_DISABLE 0
#define TIM_CHANNEL_1 1
#define TIM_COUNTERMODE_UP 1
#define TIM_CLOCKDIVISION_DIV1 1

// GPIO Ports & Peripherals
#define GPIOA ((void*)0)
#define GPIOB ((void*)0)
#define GPIOC ((void*)0)
#define GPIOD ((void*)0)
#define GPIOE ((void*)0)
#define USART1 ((void*)0)
#define USART2 ((void*)0)
#define USART3 ((void*)0)
#define SPI1 ((void*)0)
#define ADC1 ((void*)0)
#define DAC ((void*)0)
#define TIM1 ((void*)0)

// Clock Enable Macros
#define __HAL_RCC_GPIOA_CLK_ENABLE()
#define __HAL_RCC_GPIOB_CLK_ENABLE()
#define __HAL_RCC_GPIOC_CLK_ENABLE()
#define __HAL_RCC_GPIOD_CLK_ENABLE()
#define __HAL_RCC_GPIOE_CLK_ENABLE()
#define __HAL_RCC_USART1_CLK_ENABLE()
#define __HAL_RCC_USART2_CLK_ENABLE()
#define __HAL_RCC_USART3_CLK_ENABLE()
#define __HAL_RCC_SPI1_CLK_ENABLE()
#define __HAL_RCC_ADC1_CLK_ENABLE()
#define __HAL_RCC_DAC_CLK_ENABLE()
#define __HAL_RCC_TIM1_CLK_ENABLE()

// Function Stubs
static inline void HAL_Init(void) {}
static inline void HAL_GPIO_Init(void* GPIOx, GPIO_InitTypeDef* GPIO_Init) { (void)GPIOx; (void)GPIO_Init; }
static inline GPIO_PinState HAL_GPIO_ReadPin(void* GPIOx, uint16_t GPIO_Pin) { (void)GPIOx; (void)GPIO_Pin; return GPIO_PIN_RESET; }
static inline void HAL_GPIO_WritePin(void* GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState) { (void)GPIOx; (void)GPIO_Pin; (void)PinState; }

static inline int HAL_UART_Init(UART_HandleTypeDef* huart) { (void)huart; return HAL_OK; }
static inline int HAL_UART_Receive(UART_HandleTypeDef* huart, uint8_t* pData, uint16_t Size, uint32_t Timeout) { (void)huart; (void)pData; (void)Size; (void)Timeout; return HAL_ERROR; }
static inline int HAL_UART_Transmit(UART_HandleTypeDef* huart, uint8_t* pData, uint16_t Size, uint32_t Timeout) { (void)huart; (void)pData; (void)Size; (void)Timeout; return HAL_OK; }

static inline int HAL_SPI_Init(SPI_HandleTypeDef* hspi) { (void)hspi; return HAL_OK; }
static inline int HAL_SPI_Receive(SPI_HandleTypeDef* hspi, uint8_t* pData, uint16_t Size, uint32_t Timeout) { (void)hspi; (void)pData; (void)Size; (void)Timeout; return HAL_ERROR; }
static inline int HAL_SPI_Transmit(SPI_HandleTypeDef* hspi, uint8_t* pData, uint16_t Size, uint32_t Timeout) { (void)hspi; (void)pData; (void)Size; (void)Timeout; return HAL_OK; }

static inline int HAL_ADC_Init(ADC_HandleTypeDef* hadc) { (void)hadc; return HAL_OK; }
static inline void HAL_ADC_Start(ADC_HandleTypeDef* hadc) { (void)hadc; }
static inline void HAL_ADC_Stop(ADC_HandleTypeDef* hadc) { (void)hadc; }
static inline int HAL_ADC_PollForConversion(ADC_HandleTypeDef* hadc, uint32_t Timeout) { (void)hadc; (void)Timeout; return HAL_OK; }
static inline uint32_t HAL_ADC_GetValue(ADC_HandleTypeDef* hadc) { (void)hadc; return 0; }

static inline int HAL_DAC_Init(DAC_HandleTypeDef* hdac) { (void)hdac; return HAL_OK; }
static inline int HAL_DAC_ConfigChannel(DAC_HandleTypeDef* hdac, DAC_ChannelConfTypeDef* sConfig, uint32_t Channel) { (void)hdac; (void)sConfig; (void)Channel; return HAL_OK; }
static inline void HAL_DAC_Start(DAC_HandleTypeDef* hdac, uint32_t Channel) { (void)hdac; (void)Channel; }
static inline void HAL_DAC_SetValue(DAC_HandleTypeDef* hdac, uint32_t Channel, uint32_t Alignment, uint32_t Value) { (void)hdac; (void)Channel; (void)Alignment; (void)Value; }

static inline int HAL_TIM_PWM_Init(TIM_HandleTypeDef* htim) { (void)htim; return HAL_OK; }
static inline int HAL_TIM_PWM_ConfigChannel(TIM_HandleTypeDef* htim, TIM_OC_InitTypeDef* sConfigOC, uint32_t Channel) { (void)htim; (void)sConfigOC; (void)Channel; return HAL_OK; }
static inline void HAL_TIM_PWM_Start(TIM_HandleTypeDef* htim, uint32_t Channel) { (void)htim; (void)Channel; }
#define __HAL_TIM_SET_COMPARE(__HANDLE__, __CHANNEL__, __COMPARE__) (void)(__HANDLE__)

static inline void HAL_Delay(uint32_t Delay) { (void)Delay; }
static inline uint32_t HAL_GetTick(void) { return 0; }

#endif
