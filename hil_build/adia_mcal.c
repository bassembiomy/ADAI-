/* Generated MCAL adapters. Unsupported providers fail closed. */
#include "adia_mcal.h"
#include "hal_drivers.h"
#include <stddef.h>

adia_mcal_status_t adia_mcal_gpio_init(void)
{
    return ADIA_MCAL_OK;
}

adia_mcal_status_t adia_mcal_gpio_deinit(void)
{
    return ADIA_MCAL_OK;
}

adia_mcal_status_t adia_mcal_gpio_health(void)
{
    return ADIA_MCAL_OK;
}

adia_mcal_status_t adia_mcal_gpio_safe_state(void)
{
    HAL_GPIO_Write(PIN_CH_1, "ch_1", (0 != 0));
    return ADIA_MCAL_OK;
}

adia_mcal_status_t adia_mcal_gpio_write(adia_mcal_gpio_channel_t ch, int32_t value)
{
    (void)ch;
    switch (ch) {
    case ADIA_MCAL_GPIO_34D93ED7_4309_4EA8_B6E3_2CECEA48F7A9:
        HAL_GPIO_Write(PIN_CH_1, "ch_1", (value != 0));
        return ADIA_MCAL_OK;
    default: return ADIA_MCAL_INVALID_CHANNEL;
    }
}

