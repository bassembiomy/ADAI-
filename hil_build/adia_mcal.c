/* Generated MCAL adapters. Unsupported providers fail closed. */
#include "adia_mcal.h"
#include "hal_drivers.h"

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

adia_mcal_status_t adia_mcal_gpio_read(adia_mcal_gpio_channel_t ch, int32_t *out_value)
{
    (void)ch;
    if (out_value == NULL) { return ADIA_MCAL_INVALID_STATE; }
    switch (ch) {
    case ADIA_MCAL_GPIO_F0B3089A_1426_4D8A_ADD0_6A146A51378E:
        *out_value = HAL_GPIO_Read(PIN_CH_2, "ch_2") ? 1 : 0;
        return ADIA_MCAL_OK;
    default: return ADIA_MCAL_INVALID_CHANNEL;
    }
}

adia_mcal_status_t adia_mcal_gpio_write(adia_mcal_gpio_channel_t ch, int32_t value)
{
    (void)ch;
    switch (ch) {
    case ADIA_MCAL_GPIO_9B4C84B5_D1BA_413C_83BC_E11F567B19CF:
        HAL_GPIO_Write(PIN_CH_1, "ch_1", (value != 0));
        return ADIA_MCAL_OK;
    default: return ADIA_MCAL_INVALID_CHANNEL;
    }
}

